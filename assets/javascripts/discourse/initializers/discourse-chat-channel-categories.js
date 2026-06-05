import { apiInitializer } from "discourse/lib/api";

const VIEW_SELECTOR = ".chat-browse-view";
const ACTIONS_SELECTOR = ".chat-browse-view__actions";
const CONTENT_SELECTOR = ".chat-browse-view__content";
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
const EMPTY_CLASS = "dcc-chat-category-filter-empty";
const INDEX_FETCH_LIMIT = 200;
const LOAD_MORE_ATTEMPTS = 8;
const LOAD_MORE_DELAY = 650;
const channelCategories = new Map();
const channelIdsByCategory = new Map();
const categories = new Map();
const indexedCategoryIdsByStatus = new Map();
const indexRequestsByStatus = new Map();

let chatChannelsManager = null;
let observer = null;
let pendingDecorate = false;
let selectedCategoryId = "";
let filterId = 0;
let site = null;

function normalizeColor(color) {
  const value = `${color || ""}`.replace(/^#/, "").trim();
  return /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? `#${value}` : "";
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

function currentBrowseStatus() {
  const match = location.pathname.match(/\/chat\/browse\/(all|open|closed)/);
  return match?.[1] || "all";
}

function rememberCategory(category, fallbackUrl = "") {
  if (!category) {
    return null;
  }

  const id = `${category.id || category.category_id || ""}`;
  const existing = categories.get(id) || {};
  const name = category.name || category.displayName || existing.name;

  if (!id || !name) {
    return null;
  }

  const parentId =
    category.parent_category_id || category.parentCategoryId || existing.parentId;

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

  if (!channelIdsByCategory.has(category.id)) {
    channelIdsByCategory.set(category.id, new Set());
  }
  channelIdsByCategory.get(category.id).add(`${channel.id}`);
}

function rememberLoadedChannelCategories() {
  rememberSiteCategories();
  chatChannelsManager?.channels?.forEach(rememberChannelCategory);
}

function sortedCategories() {
  rememberLoadedChannelCategories();

  const statusCategoryIds = indexedCategoryIdsByStatus.get(currentBrowseStatus());
  const categoryIds = statusCategoryIds?.size
    ? Array.from(statusCategoryIds)
    : Array.from(new Set(Array.from(channelCategories.values()).map((category) => category.id)));

  return categoryIds
    .map((id) => categories.get(`${id}`))
    .filter(Boolean)
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
}

async function indexChannelCategories() {
  const status = currentBrowseStatus();
  if (indexRequestsByStatus.has(status)) {
    return indexRequestsByStatus.get(status);
  }

  if (indexedCategoryIdsByStatus.has(status)) {
    return indexedCategoryIdsByStatus.get(status);
  }

  rememberLoadedChannelCategories();
  const loadedCategoryIds = new Set(
    Array.from(channelCategories.values()).map((category) => category.id)
  );

  if (loadedCategoryIds.size > 1) {
    indexedCategoryIdsByStatus.set(status, loadedCategoryIds);
    syncCategoryFilters();
    return loadedCategoryIds;
  }

  const params = new URLSearchParams({
    limit: `${INDEX_FETCH_LIMIT}`,
    filter: "",
    status,
  });

  const request = fetch(`/chat/api/channels?${params}`, {
    headers: { accept: "application/json" },
  })
    .then((response) => {
      if (!response.ok) {
        const error = new Error(`Chat channel index failed with ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    })
    .then((json) => {
      const statusCategoryIds = new Set();

      (json.channels || []).forEach((channel) => {
        rememberChannelCategory(channel);
        const category = channelCategories.get(`${channel.id}`);

        if (category) {
          statusCategoryIds.add(category.id);
        }
      });

      indexedCategoryIdsByStatus.set(status, statusCategoryIds);
      syncCategoryFilters();
      return statusCategoryIds;
    })
    .catch((error) => {
      if (error?.status === 429) {
        setTimeout(() => indexChannelCategories(), 8000);
      }

      return null;
    })
    .finally(() => {
      indexRequestsByStatus.delete(status);
    });

  indexRequestsByStatus.set(status, request);
  return request;
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

function categoryFilterOptions(select) {
  const previousValue = select.value || selectedCategoryId;
  const options = sortedCategories();

  select.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  select.appendChild(allOption);

  options.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = categoryLabel(category);
    select.appendChild(option);
  });

  if (options.some((category) => category.id === previousValue)) {
    select.value = previousValue;
    return;
  }

  if (selectedCategoryId === previousValue) {
    selectedCategoryId = "";
  }

  select.value = "";
}

function syncCategoryFilters() {
  document
    .querySelectorAll(`.${FILTER_SELECT_CLASS}`)
    .forEach((select) => {
      categoryFilterOptions(select);
      select.value = selectedCategoryId;
    });
}

function createCategoryFilter(view) {
  const wrapper = document.createElement("div");
  wrapper.className = FILTER_CLASS;

  const selectId = `dcc-chat-category-filter-${++filterId}`;
  const label = document.createElement("label");
  label.className = "sr-only";
  label.htmlFor = selectId;
  label.textContent = "Filter channels by category";

  const select = document.createElement("select");
  select.id = selectId;
  select.className = FILTER_SELECT_CLASS;
  select.setAttribute("aria-label", "Filter channels by category");
  select.addEventListener("change", (event) => {
    selectedCategoryId = event.target.value;
    syncCategoryFilters();
    applyCategoryFilterAfterLoading();
  });

  wrapper.append(label, select);
  categoryFilterOptions(select);
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
    categoryFilterOptions(filter.querySelector(`.${FILTER_SELECT_CLASS}`));
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

function updateEmptyState(view, visibleCount, totalCount) {
  let empty = view.querySelector(`.${EMPTY_CLASS}`);
  const shouldShow = Boolean(
    selectedCategoryId && totalCount > 0 && visibleCount === 0
  );

  if (!shouldShow) {
    empty?.remove();
    return;
  }

  if (!empty) {
    empty = document.createElement("div");
    empty.className = EMPTY_CLASS;
    empty.textContent = "No channels in this category";
    view.querySelector(CONTENT_SELECTOR)?.appendChild(empty);
  }
}

function clearCategoryFilter(view) {
  view.querySelectorAll(CARD_SELECTOR).forEach((card) => {
    card.hidden = false;
    card.classList.remove("dcc-chat-channel-card--category-hidden");
  });

  view.querySelector(`.${EMPTY_CLASS}`)?.remove();
}

function applyCategoryFilter(root = document) {
  const views = [];

  if (root.matches?.(VIEW_SELECTOR)) {
    views.push(root);
  }

  root.querySelectorAll?.(VIEW_SELECTOR).forEach((view) => views.push(view));

  views.forEach((view) => {
    let visibleCount = 0;
    const cards = Array.from(view.querySelectorAll(CARD_SELECTOR));

    cards.forEach((card) => {
      const categoryId = card.dataset.dccCategoryId;
      const hidden = Boolean(selectedCategoryId && categoryId !== selectedCategoryId);
      card.hidden = hidden;
      card.classList.toggle("dcc-chat-channel-card--category-hidden", hidden);

      if (!hidden) {
        visibleCount += 1;
      }
    });

    updateEmptyState(view, visibleCount, cards.length);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scrollViewToLoadMore(view) {
  const scrollRoot = document.scrollingElement || document.documentElement;
  scrollRoot.scrollTop = scrollRoot.scrollHeight;

  let node = view;
  while (node && node !== document.body) {
    if (node.scrollHeight > node.clientHeight) {
      node.scrollTop = node.scrollHeight;
    }

    node = node.parentElement;
  }
}

async function ensureSelectedCategoryIsRendered(view) {
  if (!selectedCategoryId) {
    return;
  }

  clearCategoryFilter(view);
  decorateCards(view, { skipApply: true, skipIndex: true });

  const expectedCount = channelIdsByCategory.get(selectedCategoryId)?.size || 0;
  const initialMatchCount = view.querySelectorAll(
    `${CARD_SELECTOR}[data-dcc-category-id="${selectedCategoryId}"]`
  ).length;

  if (initialMatchCount > 0) {
    return;
  }

  for (let attempt = 0; attempt < LOAD_MORE_ATTEMPTS; attempt += 1) {
    decorateCards(view, { skipApply: true, skipIndex: true });

    const matchingCards = view.querySelectorAll(
      `${CARD_SELECTOR}[data-dcc-category-id="${selectedCategoryId}"]`
    );
    if (
      matchingCards.length > 0 &&
      (!expectedCount || matchingCards.length >= expectedCount)
    ) {
      return;
    }

    const previousCount = view.querySelectorAll(CARD_SELECTOR).length;
    if (previousCount === 0) {
      return;
    }

    scrollViewToLoadMore(view);
    await delay(LOAD_MORE_DELAY);

    if (view.querySelectorAll(CARD_SELECTOR).length <= previousCount && attempt > 1) {
      return;
    }
  }
}

async function applyCategoryFilterAfterLoading(root = document) {
  const views = [];

  if (root.matches?.(VIEW_SELECTOR)) {
    views.push(root);
  }

  root.querySelectorAll?.(VIEW_SELECTOR).forEach((view) => views.push(view));

  await Promise.all(views.map((view) => ensureSelectedCategoryIsRendered(view)));
  applyCategoryFilter(root);
}

function decorateCards(root = document, options = {}) {
  rememberLoadedChannelCategories();
  ensureCategoryFilters(root);
  root.querySelectorAll?.(CARD_SELECTOR).forEach(decorateCard);
  syncCategoryFilters();

  if (!options.skipApply) {
    applyCategoryFilter(root);
  }

  if (!options.skipIndex) {
    indexChannelCategories();
  }
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
            (node.matches?.(
              `${VIEW_SELECTOR}, ${ACTIONS_SELECTOR}, ${CARD_SELECTOR}`
            ) ||
              node.querySelector?.(
                `${VIEW_SELECTOR}, ${ACTIONS_SELECTOR}, ${CARD_SELECTOR}`
              ))
        )
      )
    ) {
      scheduleDecorate();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scheduleDecorate();
}

export default apiInitializer((api) => {
  chatChannelsManager = api.container.lookup("service:chat-channels-manager");
  site =
    api.container.lookup("service:site") ||
    window.require?.("discourse/models/site")?.default?.current?.();

  api.onPageChange(() => {
    observeCards();
    scheduleDecorate();
  });

  observeCards();
});
