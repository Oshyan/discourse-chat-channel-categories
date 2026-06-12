# Discourse Chat Channel Categories

`discourse-chat-channel-categories` adds category context and category filtering to the Discourse chat channel browser. It decorates channel browser cards with a compact category label and makes the category dropdown filter the native chat channel API request.

## Behavior

- Adds a compact category label to category-backed chat channel cards in `/chat/browse`.
- Shows parent category context for subcategories, for example `Edge Esmeralda 2025 / Housing`.
- Adds a category dropdown backed by a small category metadata endpoint so options do not depend on scroll position.
- Filters channels server-side through Discourse's native `/chat/api/channels` category parameters.
- Moves the member count and channel action into the channel title row to reduce vertical card height.
- Uses existing chat channel and site category data; no extra channel payload fields are added.
- Updates as the browser paginates, filters, or rerenders cards.
- Patches the existing chat browser collection path while preserving Discourse's routes, tabs, card component, membership buttons, and infinite loader.

See [docs/maintenance.md](docs/maintenance.md) for upgrade risks and the Discourse update smoke checklist.

## Category Options API

The plugin exposes a lightweight endpoint for consumers that need the list of visible chat-backed categories:

```text
GET /chat-channel-categories/categories.json?status=all
```

### Auth

The endpoint inherits Discourse chat API permissions. The caller must be logged in and allowed to use chat.

### Query params

- `status`: optional chat channel status filter. Supported values are `all`, `open`, `closed`, and `archived`. Missing or invalid values are treated as `all`.

### Response

```json
{
  "categories": [
    {
      "id": 12,
      "name": "Housing",
      "slug": "housing",
      "color": "0088CC",
      "parent_category_id": 4,
      "url": "/c/edge-esmeralda-2025/housing/12",
      "parent": {
        "id": 4,
        "name": "Edge Esmeralda 2025",
        "slug": "edge-esmeralda-2025",
        "color": "0088CC",
        "parent_category_id": null,
        "url": "/c/edge-esmeralda-2025/4"
      }
    }
  ]
}
```

Only categories for chat channels visible to the current user are returned. This endpoint is for category option metadata only; use Discourse's native `/chat/api/channels` endpoint for channel results.

When applying a selected category to the browser, the plugin calls the native channel API with:

```text
chatable_id=<category_id>
chatable_type=Category
include_subcategories=true
```

## Install

Add the plugin to a Discourse container like any other plugin and rebuild:

```ruby
git clone https://github.com/Oshyan/discourse-chat-channel-categories.git
```
