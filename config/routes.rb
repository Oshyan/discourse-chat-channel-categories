# frozen_string_literal: true

Discourse::Application.routes.append do
  get "/chat-channel-categories/categories.json" => "discourse_chat_channel_categories/categories#index",
      defaults: {
        format: :json,
      }
  get "/chat-channel-categories/active-channels.json" =>
        "discourse_chat_channel_categories/active_channels#index",
      defaults: {
        format: :json,
      }
end
