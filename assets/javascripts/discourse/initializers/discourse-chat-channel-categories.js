import { getOwner } from "@ember/owner";
import { schedule } from "@ember/runloop";
import { apiInitializer } from "discourse/lib/api";
import BrowseChannels from "discourse/plugins/chat/discourse/components/browse-channels";

const VIEW_SELECTOR = ".chat-browse-view";
const ACTIONS_SELECTOR = ".chat-browse-view__actions";
const CARD_SELECTOR = ".chat-channel-card[data-channel-id]";
const HEADER_SELECTOR = ".chat-channel-card__header";
const NAME_SELECTOR = ".chat-channel-card__name-container";
const MEMBERS_SELECTOR = ".chat-channel-card__members";
const CTA_SELECTOR = ".chat-channel-card__cta";
const BADGE_CLASS = "dcc-chat-channel-category";
const APPLIED_ATTRIBUTE = "data-dcc-category-channel-id";
const TITLE_ROW_CLASS = "dcc-chat-channel-card__title-row";
const FILTER_CLASS = "dcc-chat-category-filter";
const FILTER_SELECT_CLASS = "dcc-chat-category-filter__select";
const COLLECTION_LIMIT = 10;

const channelCategories = new Map();
const categories = new Map();
const browseCollections = new WeakMap();

let chatChannelsManager = null;
let categoryService = null;
let observer = null;
let pendingDecorate = false;
let filterId = 0;
let site = null;
let browseChannelsPatched = false;

function normalizeColor(color) {
  const value = `${color || ""}`.replace(/^#/, "").trim();
  return /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? `#${value}` : "";
}

function normalizeStatus(status) {
  return ["all", "open", "closed", "archived"].includes(status) ? status : "all";
}

function currentBrowseStatus() {
  const match = location.pathname.match(/\/chat\/browse\/(all|open|closed|archived)/);
  return normalizeStatus(match?.[1]);
}

function browseStatusForView(view) {
  const activeTab = view.querySelector(".chat-browse-view__filter-link.active");
  const tabClass = Array.from(activeTab?.classList || []).find((className) =>
    /^-(all|open|closed|archived)$/.test(className)
  );

  return normalizeStatus(tabClass?.slice(1) || currentBrowseStatus());
}

function categoryUrl(category) {
  if (!category) {
    return "";
  }

  if (category.url) {
    return category.url;
  }

  if (category.slug && category.id) {
    return `/c/${category.slug}/${category.id}`;
  }

  return "";
}

function rememberCategory(category, fallbackUrl = "") {
  if (!category) {
    return null;
  }

  if (category.parent) {
    rememberCategory(category.parent);
  }

  const id = `${category.id || category.category_id || ""}`;
  const existing = categories.get(id) || {};
  const name = category.name || category.displayName || existing.name;

  if (!id || !name) {
    return null;
  }

  const parentId =
    category.parent_category_id ||
    category.parentCategoryId ||
    category.parent?.id ||
    existing.parentId;

  const record = {
    id,
    name,
    color: normalizeColor(category.color) || existing.color || "",
    parentId: parentId ? `${parentId}` : "",
    url: fallbackUrl || category.url || existing.url || categoryUrl(category),
  };

  categories.set(id, record);
  return record;
}

function rememberSiteCategories() {
  const siteCategories = site?.categories || site?.categoriesList || [];
  siteCategories.forEach((category) => rememberCategory(category));
}

function categoryLabel(category) {
  const record = categories.get(`${category?.id}`) || category;
  const parent = record?.parentId ? categories.get(`${record.parentId}`) : null;

  if (parent?.name && parent.id !== record.id) {
    return `${parent.name} / ${record.name}`;
  }

  return record?.name || "";
}

function readCategory(channel) {
  if (!channel || `${channel.chatableType || channel.chatable_type}` !== "Category") {
    return null;
  }

  rememberSiteCategories();
  return rememberCategory(channel.chatable, channel.chatableUrl || channel.chatable_url);
}

function rememberChannelCategory(channel) {
  const category = readCategory(channel);

  if (!category) {
    return;
  }

  channelCategories.set(`${channel.id}`, category);
}

function rememberLoadedChannelCategories() {
  rememberSiteCategories();
  chatChannelsManager?.channels?.forEach(rememberChannelCategory);
}

function sortedCategories(status = currentBrowseStatus()) {
  const serviceCategories = categoryService?.categoriesForStatus(status) || [];

  if (serviceCategories.length) {
    serviceCategories.forEach((category) => {
      rememberCategory(category.parent);
      rememberCategory(category);
    });

    return [...serviceCategories].sort((a, b) =>
      categoryLabel(a).localeCompare(categoryLabel(b))
    );
  }

  rememberLoadedChannelCategories();
  return Array.from(new Set(Array.from(channelCategories.values()).map((category) => category.id)))
    .map((id) => categories.get(`${id}`))
    .filter(Boolean)
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
}

function updateBadgeElement(badge, category) {
  const label = categoryLabel(category);
  badge.textContent = label;
  badge.title = `Category: ${label}`;
  badge.setAttribute("aria-label", `Category: ${label}`);

  if (category.color) {
    badge.style.setProperty("--dcc-chat-category-color", category.color);
  } else {
    badge.style.removeProperty("--dcc-chat-category-color");
  }

  if (badge.tagName === "A" && category.url) {
    badge.href = category.url;
  }
}

function createBadge(category) {
  const badge = document.createElement(category.url ? "a" : "span");
  badge.className = BADGE_CLASS;

  if (category.url) {
    badge.href = category.url;
  }

  updateBadgeElement(badge, category);
  return badge;
}

function ensureTitleRow(card, header) {
  const nameContainer = header.querySelector(NAME_SELECTOR);
  if (!nameContainer) {
    return;
  }

  let titleRow = header.querySelector(`.${TITLE_ROW_CLASS}`);
  if (!titleRow) {
    titleRow = document.createElement("div");
    titleRow.className = TITLE_ROW_CLASS;
    header.insertBefore(titleRow, header.firstChild);
  }

  if (nameContainer.parentElement !== titleRow) {
    titleRow.insertBefore(nameContainer, titleRow.firstChild);
  }

  const members =
    card.querySelector(`:scope > ${MEMBERS_SELECTOR}`) ||
    header.querySelector(MEMBERS_SELECTOR);

  if (members && members.parentElement !== titleRow) {
    titleRow.appendChild(members);
  }

  const cta = card.querySelector(`:scope > ${CTA_SELECTOR}`);
  if (cta && cta.parentElement !== titleRow) {
    titleRow.appendChild(cta);
  }
}

function decorateCard(card) {
  const channelId = card?.dataset?.channelId;
  const category = channelCategories.get(`${channelId}`);

  if (!channelId || !category) {
    return;
  }

  const header = card.querySelector(HEADER_SELECTOR);
  if (!header) {
    return;
  }

  ensureTitleRow(card, header);

  let badge = header.querySelector(`.${BADGE_CLASS}`);
  if (!badge) {
    badge = createBadge(category);
    header.appendChild(badge);
  } else {
    updateBadgeElement(badge, category);
  }

  badge.setAttribute(APPLIED_ATTRIBUTE, channelId);
  card.classList.add("dcc-chat-channel-card--with-category");
  card.dataset.dccCategoryId = category.id;
}

function selectedCategoryId() {
  return categoryService?.selectedCategoryId || "";
}

function categoryFilterOptions(select, status = currentBrowseStatus()) {
  const previousValue = select.value || selectedCategoryId();
  const options = sortedCategories(status);

  select.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  select.appendChild(allOption);

  if (!options.length && categoryService?.isLoading(status)) {
    const loadingOption = document.createElement("option");
    loadingOption.disabled = true;
    loadingOption.textContent = "Loading categories...";
    select.appendChild(loadingOption);
  }

  options.forEach((category) => {
    const option = document.createElement("option");
    option.value = `${category.id}`;
    option.textContent = categoryLabel(category);
    select.appendChild(option);
  });

  if (options.some((category) => `${category.id}` === previousValue)) {
    select.value = previousValue;
    return;
  }

  if (selectedCategoryId() === previousValue) {
    categoryService?.setSelectedCategoryId("");
  }

  select.value = "";
}

function syncCategoryFilters() {
  document.querySelectorAll(`.${FILTER_SELECT_CLASS}`).forEach((select) => {
    categoryFilterOptions(select, select.dataset.dccStatus || currentBrowseStatus());
    select.value = selectedCategoryId();
  });
}

function loadCategoryOptions(status = currentBrowseStatus()) {
  if (
    !categoryService ||
    categoryService.hasLoaded(status) ||
    categoryService.isLoading(status)
  ) {
    return;
  }

  categoryService
    .loadCategories(status)
    .then((loadedCategories) => {
      loadedCategories.forEach((category) => {
        rememberCategory(category.parent);
        rememberCategory(category);
      });
      syncCategoryFilters();
      scheduleDecorate();
    })
    .catch(() => {
      syncCategoryFilters();
    });
}

function createCategoryFilter(view) {
  const wrapper = document.createElement("div");
  wrapper.className = FILTER_CLASS;

  const status = browseStatusForView(view);
  const selectId = `dcc-chat-category-filter-${++filterId}`;
  const label = document.createElement("label");
  label.className = "sr-only";
  label.htmlFor = selectId;
  label.textContent = "Filter channels by category";

  const select = document.createElement("select");
  select.id = selectId;
  select.className = FILTER_SELECT_CLASS;
  select.dataset.dccStatus = status;
  select.setAttribute("aria-label", "Filter channels by category");
  select.addEventListener("change", (event) => {
    categoryService?.setSelectedCategoryId(event.target.value);
    syncCategoryFilters();
    scheduleDecorate();
  });

  wrapper.append(label, select);
  categoryFilterOptions(select, status);
  loadCategoryOptions(status);
  return wrapper;
}

function ensureCategoryFilter(view) {
  const actions = view.querySelector(ACTIONS_SELECTOR);
  if (!actions) {
    return;
  }

  let filter = actions.querySelector(`.${FILTER_CLASS}`);
  if (!filter) {
    filter = createCategoryFilter(view);
    const nativeFilter = actions.querySelector(".filter-input-container");
    actions.insertBefore(filter, nativeFilter || null);
  } else {
    const select = filter.querySelector(`.${FILTER_SELECT_CLASS}`);
    if (select) {
      select.dataset.dccStatus = browseStatusForView(view);
      categoryFilterOptions(select, select.dataset.dccStatus);
      loadCategoryOptions(select.dataset.dccStatus);
    }
  }
}

function ensureCategoryFilters(root = document) {
  const views = [];

  if (root.matches?.(VIEW_SELECTOR)) {
    views.push(root);
  }

  root.querySelectorAll?.(VIEW_SELECTOR).forEach((view) => views.push(view));
  views.forEach(ensureCategoryFilter);
}

function decorateCards(root = document) {
  rememberLoadedChannelCategories();
  ensureCategoryFilters(root);
  root.querySelectorAll?.(CARD_SELECTOR).forEach(decorateCard);
  syncCategoryFilters();
}

function scheduleDecorate(root = document) {
  if (pendingDecorate) {
    return;
  }

  pendingDecorate = true;

  requestAnimationFrame(() => {
    pendingDecorate = false;
    decorateCards(root);
  });
}

function observeCards() {
  if (observer || !document.body) {
    return;
  }

  observer = new MutationObserver((mutations) => {
    if (
      mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            (node.matches?.(`${VIEW_SELECTOR}, ${ACTIONS_SELECTOR}, ${CARD_SELECTOR}`) ||
              node.querySelector?.(`${VIEW_SELECTOR}, ${ACTIONS_SELECTOR}, ${CARD_SELECTOR}`))
        )
      )
    ) {
      scheduleDecorate();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scheduleDecorate();
}

function patchedCollectionParams(component) {
  const params = {
    filter: component.filter,
    status: component.currentTab,
  };

  if (categoryService?.selectedCategoryId) {
    params.chatable_id = categoryService.selectedCategoryId;
    params.chatable_type = "Category";
    params.include_subcategories = true;
  }

  return params;
}

function patchBrowseChannels() {
  if (browseChannelsPatched) {
    return;
  }

  if (!BrowseChannels?.prototype) {
    // Chat internals are private API. If core moves this component, fail closed
    // instead of preventing Discourse from booting.
    // eslint-disable-next-line no-console
    console.warn(
      "[discourse-chat-channel-categories] BrowseChannels component unavailable; category filtering disabled"
    );
    return;
  }

  try {
    Object.defineProperty(BrowseChannels.prototype, "channelsCollection", {
      configurable: true,
      get() {
        const ownerService =
          getOwner(this)?.lookup("service:dcc-chat-channel-categories") ||
          categoryService;
        const selectedId = ownerService?.selectedCategoryId || "";
        const params = patchedCollectionParams(this);
        const key = JSON.stringify({
          filter: params.filter || "",
          status: params.status || "all",
          categoryId: selectedId,
        });
        let cached = browseCollections.get(this);

        if (!cached || cached.key !== key) {
          const collection = this.chatApi.channels(params);
          cached = { key, collection };
          browseCollections.set(this, cached);
          schedule("afterRender", () => collection.load({ limit: COLLECTION_LIMIT }));
        }

        return cached.collection;
      },
    });

    Object.defineProperty(BrowseChannels.prototype, "debouncedLoad", {
      configurable: true,
      value() {
        this.channelsCollection.load({ limit: COLLECTION_LIMIT });
      },
    });

    browseChannelsPatched = true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      "[discourse-chat-channel-categories] Unable to patch BrowseChannels; category filtering disabled",
      error
    );
  }
}

export default apiInitializer((api) => {
  chatChannelsManager = api.container.lookup("service:chat-channels-manager");
  categoryService = api.container.lookup("service:dcc-chat-channel-categories");
  site =
    api.container.lookup("service:site") ||
    window.require?.("discourse/models/site")?.default?.current?.();

  patchBrowseChannels();

  api.onPageChange(() => {
    if (!location.pathname.startsWith("/chat/browse")) {
      categoryService?.setSelectedCategoryId("");
    }

    observeCards();
    scheduleDecorate();
  });

  observeCards();
});
