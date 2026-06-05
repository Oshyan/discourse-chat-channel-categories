import { apiInitializer } from "discourse/lib/api";

const VIEW_SELECTOR = ".chat-browse-view";
const ACTIONS_SELECTOR = ".chat-browse-view__actions";
const CONTENT_SELECTOR = ".chat-browse-view__content";
const CARD_SELECTOR = ".chat-channel-card[data-channel-id]";
const HEADER_SELECTOR = ".chat-channel-card__header";
const NAME_SELECTOR = ".chat-channel-card__name-container";
const MEMBERS_SELECTOR = ".chat-channel-card__members";
const BADGE_CLASS = "dcc-chat-channel-category";
const APPLIED_ATTRIBUTE = "data-dcc-category-channel-id";
const TITLE_ROW_CLASS = "dcc-chat-channel-card__title-row";
const FILTER_CLASS = "dcc-chat-category-filter";
const FILTER_SELECT_CLASS = "dcc-chat-category-filter__select";
const EMPTY_CLASS = "dcc-chat-category-filter-empty";
const channelCategories = new Map();

let chatChannelsManager = null;
let observer = null;
let pendingDecorate = false;
let selectedCategoryId = "";
let filterId = 0;

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

function readCategory(channel) {
  if (!channel || `${channel.chatableType || channel.chatable_type}` !== "Category") {
    return null;
  }

  const chatable = channel.chatable;
  const name = chatable?.name || chatable?.displayName;

  if (!name) {
    return null;
  }

  return {
    id: `${chatable.id || channel.chatableId || channel.chatable_id || name}`,
    name,
    color: normalizeColor(chatable.color),
    url: channel.chatableUrl || channel.chatable_url || categoryUrl(chatable),
  };
}

function rememberChannelCategory(channel) {
  const category = readCategory(channel);

  if (!category) {
    return;
  }

  channelCategories.set(`${channel.id}`, category);
}

function rememberLoadedChannelCategories() {
  chatChannelsManager?.channels?.forEach(rememberChannelCategory);
}

function sortedCategories() {
  rememberLoadedChannelCategories();

  return Array.from(
    new Map(
      Array.from(channelCategories.values()).map((category) => [
        category.id,
        category,
      ])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
}

function sortedCategoriesForView(view) {
  const renderedCategoryIds = new Set(
    Array.from(view.querySelectorAll(CARD_SELECTOR))
      .map((card) => channelCategories.get(`${card.dataset.channelId}`)?.id)
      .filter(Boolean)
  );

  if (renderedCategoryIds.size === 0) {
    return sortedCategories();
  }

  return sortedCategories().filter((category) =>
    renderedCategoryIds.has(category.id)
  );
}

function updateBadgeElement(badge, category) {
  badge.textContent = category.name;
  badge.title = `Category: ${category.name}`;
  badge.setAttribute("aria-label", `Category: ${category.name}`);

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

function categoryFilterOptions(select, view) {
  const previousValue = select.value || selectedCategoryId;
  const categories = view ? sortedCategoriesForView(view) : sortedCategories();

  select.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  select.appendChild(allOption);

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });

  if (categories.some((category) => category.id === previousValue)) {
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
      categoryFilterOptions(select, select.closest(VIEW_SELECTOR));
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
    applyCategoryFilter();
  });

  wrapper.append(label, select);
  categoryFilterOptions(select, view);
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
    categoryFilterOptions(filter.querySelector(`.${FILTER_SELECT_CLASS}`), view);
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

function decorateCards(root = document) {
  rememberLoadedChannelCategories();
  ensureCategoryFilters(root);
  root.querySelectorAll?.(CARD_SELECTOR).forEach(decorateCard);
  syncCategoryFilters();
  applyCategoryFilter(root);
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

  api.onPageChange(() => {
    observeCards();
    scheduleDecorate();
  });

  observeCards();
});
