# Maintenance and Upgrade Risk

This plugin intentionally takes a thin-replacement approach to Discourse's chat channel browser. It preserves Discourse's routes, tabs, list component, card component, membership buttons, and native `/chat/api/channels` pagination, but it patches internal chat browser behavior so the category dropdown can drive real server-side filtering.

That approach is much smaller than replacing the whole browser, but it is not a stable public plugin API. Treat Discourse chat upgrades as compatibility events for this plugin.

## Why This Is Risky

The frontend initializer imports and patches Discourse's internal `BrowseChannels` component:

```js
import BrowseChannels from "discourse/plugins/chat/discourse/components/browse-channels";
```

It replaces the component's `channelsCollection` getter so the selected category becomes part of the native channel API request:

```text
chatable_id=<category_id>
chatable_type=Category
include_subcategories=true
```

The DOM decorator also depends on current chat browser/card class names so it can insert the category dropdown and move the member count/action into the title row.

## Discourse Internals To Watch

Check these upstream files whenever Discourse is upgraded:

```text
plugins/chat/assets/javascripts/discourse/components/browse-channels.gjs
plugins/chat/assets/javascripts/discourse/components/chat-channel-card.gjs
plugins/chat/assets/javascripts/discourse/components/chat/list/index.gjs
plugins/chat/app/controllers/chat/api/channels_controller.rb
plugins/chat/lib/chat/channel_fetcher.rb
```

Breaking changes to watch for:

- `BrowseChannels` is renamed, moved, or converted to a shape that cannot be patched with `Object.defineProperty`.
- `channelsCollection` is renamed or no longer controls channel loading.
- `chatApi.channels(...)` stops accepting passthrough params.
- `/chat/api/channels` changes or removes `chatable_id`, `chatable_type`, or `include_subcategories`.
- `Chat::ChannelFetcher.generate_allowed_channel_ids_sql(...)` changes, is removed, or no longer represents the right permission boundary.
- Chat card class names or markup change, especially `.chat-channel-card`, `.chat-channel-card__header`, `.chat-channel-card__name-container`, `.chat-channel-card__members`, `.chat-channel-card__cta`, or `.chat-browse-view__actions`.
- The drawer route stops rendering the same browse component or changes the browse tab markup.

## Update Workflow

Use the EdgeTech environment order for Discourse plugin work:

1. Develop locally or on the dev environment.
2. Deploy and test on `edge2.ogreenius.com`.
3. Deploy to `edge.ogreenius.com` only during controlled production intervals or when explicitly requested.

Do not use production as the default compatibility test target.

## Smoke Checklist

Run this checklist on `edge2.ogreenius.com` after every Discourse update that touches chat, assets, routing, or Rails:

- `/chat/browse/all` loads without a hard refresh error.
- `/chat/browse/open`, `/chat/browse/closed`, and `/chat/browse/archived` load if enabled.
- The category dropdown appears in the full-screen channel browser.
- The category dropdown appears in the collapsed/floating chat drawer browser.
- Category options load and include parent category labels when applicable.
- Selecting a category filters the visible channels.
- Search still works with no category selected.
- Search still works with a category selected.
- Clearing the category returns to unfiltered results.
- Joining and leaving channels still works.
- Member count links still work.
- Category pills still appear on channel cards.
- Browser console has no new errors.
- Network requests for filtered results include `chatable_id`, `chatable_type=Category`, and `include_subcategories=true`.
- The category-options endpoint returns `403 not_logged_in` when unauthenticated and returns visible categories when authenticated:

```text
GET /chat-channel-categories/categories.json?status=all
```

## Suggested Automated Checks

A future lightweight compatibility script should fail if:

- The expected upstream chat files are missing.
- `browse-channels.gjs` no longer contains `channelsCollection`.
- `browse-channels.gjs` no longer imports or renders `ChatChannelCard`.
- `channels_controller.rb` no longer permits `chatable_id`, `chatable_type`, or `include_subcategories`.
- `channel_fetcher.rb` no longer exposes `generate_allowed_channel_ids_sql`.
- A live authenticated request to `/chat/api/channels` with category params returns a non-200 response.

These checks are not a substitute for the UI smoke checklist, but they should catch obvious breakage before production deployment.
