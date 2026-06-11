# frozen_string_literal: true

Discourse::Application.routes.append do
  get "/chat-channel-categories/categories.json" => "discourse_chat_channel_categories/categories#index",
      defaults: {
        format: :json,
      }
end
