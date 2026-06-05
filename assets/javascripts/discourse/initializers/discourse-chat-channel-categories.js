import { apiInitializer } from "discourse/lib/api";

const CARD_SELECTOR = ".chat-browse-view .chat-channel-card[data-channel-id]";
const HEADER_SELECTOR = ".chat-channel-card__header";
const BADGE_CLASS = "dcc-chat-channel-category";
const APPLIED_ATTRIBUTE = "data-dcc-category-channel-id";
const channelCategories = new Map();

let chatChannelsManager = null;
let observer = null;
let pendingDecorate = false;

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
    id: chatable.id || channel.chatableId || channel.chatable_id,
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

  let badge = header.querySelector(`.${BADGE_CLASS}`);
  if (!badge) {
    badge = createBadge(category);
    header.appendChild(badge);
  } else {
    updateBadgeElement(badge, category);
  }

  badge.setAttribute(APPLIED_ATTRIBUTE, channelId);
  card.classList.add("dcc-chat-channel-card--with-category");
}

function decorateCards(root = document) {
  rememberLoadedChannelCategories();
  root.querySelectorAll?.(CARD_SELECTOR).forEach(decorateCard);
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
            (node.matches?.(CARD_SELECTOR) || node.querySelector?.(CARD_SELECTOR))
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
