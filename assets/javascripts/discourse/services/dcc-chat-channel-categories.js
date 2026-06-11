import Service from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { ajax } from "discourse/lib/ajax";

const STATUSES = ["all", "open", "closed", "archived"];

function normalizeStatus(status) {
  return STATUSES.includes(status) ? status : "all";
}

function normalizeCategory(category) {
  const parent = category.parent
    ? {
        id: `${category.parent.id}`,
        name: category.parent.name,
        slug: category.parent.slug,
        color: category.parent.color,
        parent_category_id: category.parent.parent_category_id,
        url: category.parent.url,
      }
    : null;

  return {
    id: `${category.id}`,
    name: category.name,
    slug: category.slug,
    color: category.color,
    parent_category_id: category.parent_category_id,
    url: category.url,
    parent,
  };
}

export default class DccChatChannelCategoriesService extends Service {
  @tracked selectedCategoryId = "";
  @tracked version = 0;

  categoriesByStatus = new Map();
  loadingStatuses = new Set();
  requestsByStatus = new Map();

  setSelectedCategoryId(categoryId) {
    this.selectedCategoryId = `${categoryId || ""}`;
  }

  categoriesForStatus(status) {
    this.version;
    return this.categoriesByStatus.get(normalizeStatus(status)) || [];
  }

  isLoading(status) {
    this.version;
    return this.loadingStatuses.has(normalizeStatus(status));
  }

  hasLoaded(status) {
    this.version;
    return this.categoriesByStatus.has(normalizeStatus(status));
  }

  async loadCategories(status) {
    const normalizedStatus = normalizeStatus(status);

    if (this.categoriesByStatus.has(normalizedStatus)) {
      return this.categoriesByStatus.get(normalizedStatus);
    }

    if (this.requestsByStatus.has(normalizedStatus)) {
      return this.requestsByStatus.get(normalizedStatus);
    }

    this.loadingStatuses.add(normalizedStatus);
    this.version += 1;

    const request = ajax("/chat-channel-categories/categories.json", {
      data: { status: normalizedStatus },
    })
      .then((payload) => {
        const categories = (payload.categories || []).map(normalizeCategory);
        this.categoriesByStatus.set(normalizedStatus, categories);
        this.version += 1;
        return categories;
      })
      .finally(() => {
        this.loadingStatuses.delete(normalizedStatus);
        this.requestsByStatus.delete(normalizedStatus);
        this.version += 1;
      });

    this.requestsByStatus.set(normalizedStatus, request);
    return request;
  }
}
