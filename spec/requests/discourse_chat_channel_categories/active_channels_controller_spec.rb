# frozen_string_literal: true

RSpec.describe DiscourseChatChannelCategories::ActiveChannelsController do
  fab!(:user)
  fab!(:category)
  fab!(:other_category) { Fabricate(:category) }
  fab!(:group)
  fab!(:private_category) { Fabricate(:private_category, group: group) }

  fab!(:public_channel) { Fabricate(:category_channel, chatable: category) }
  fab!(:other_channel) { Fabricate(:category_channel, chatable: other_category) }
  fab!(:private_channel) { Fabricate(:category_channel, chatable: private_category) }

  before do
    SiteSetting.chat_enabled = true
    SiteSetting.chat_allowed_groups = Group::AUTO_GROUPS[:everyone]
  end

  def stamp_activity(channel, created_at)
    message =
      Fabricate(:chat_message, chat_channel: channel, created_at: created_at)
    channel.update!(last_message_id: message.id)
    message
  end

  it "requires login" do
    get "/chat-channel-categories/active-channels.json"
    expect(response.status).to eq(403)
  end

  context "when logged in" do
    before { sign_in(user) }

    it "returns only visible category channels ordered by recent activity" do
      stamp_activity(public_channel, 2.hours.ago)
      stamp_activity(other_channel, 1.hour.ago)
      stamp_activity(private_channel, 1.minute.ago)

      get "/chat-channel-categories/active-channels.json"

      expect(response.status).to eq(200)
      channels = response.parsed_body["channels"]
      expect(channels.map { |c| c["id"] }).to eq([other_channel.id, public_channel.id])
    end

    it "includes private channels for members of the allowed group" do
      group.add(user)
      stamp_activity(private_channel, 1.minute.ago)

      get "/chat-channel-categories/active-channels.json"

      expect(response.status).to eq(200)
      ids = response.parsed_body["channels"].map { |c| c["id"] }
      expect(ids).to include(private_channel.id)
    end

    it "excludes channels with no messages and non-open channels" do
      stamp_activity(other_channel, 1.hour.ago)
      stamp_activity(public_channel, 30.minutes.ago)
      public_channel.update!(status: :closed)

      get "/chat-channel-categories/active-channels.json"

      ids = response.parsed_body["channels"].map { |c| c["id"] }
      expect(ids).to eq([other_channel.id])
    end

    it "excludes direct message channels" do
      dm_channel = Fabricate(:direct_message_channel, users: [user, Fabricate(:user)])
      stamp_activity(public_channel, 1.hour.ago)
      dm_message = Fabricate(:chat_message, chat_channel: dm_channel)
      dm_channel.update!(last_message_id: dm_message.id)

      get "/chat-channel-categories/active-channels.json"

      ids = response.parsed_body["channels"].map { |c| c["id"] }
      expect(ids).to eq([public_channel.id])
    end

    it "clamps the limit parameter" do
      stamp_activity(public_channel, 2.hours.ago)
      stamp_activity(other_channel, 1.hour.ago)

      get "/chat-channel-categories/active-channels.json", params: { limit: 1 }
      expect(response.parsed_body["channels"].length).to eq(1)
      expect(response.parsed_body["channels"].first["id"]).to eq(other_channel.id)

      get "/chat-channel-categories/active-channels.json", params: { limit: 9999 }
      expect(response.status).to eq(200)
      expect(response.parsed_body["channels"].length).to eq(2)
    end

    it "serializes display fields without message bodies" do
      message = stamp_activity(public_channel, 1.hour.ago)

      get "/chat-channel-categories/active-channels.json"

      channel = response.parsed_body["channels"].first
      expect(channel.keys).to contain_exactly(
        "id",
        "name",
        "slug",
        "url",
        "member_count",
        "last_activity_at",
        "category",
      )
      expect(channel["url"]).to eq(public_channel.relative_url)
      expect(channel["last_activity_at"]).to eq(message.created_at.iso8601)
      expect(channel["category"]["name"]).to eq(category.name)
      expect(channel.to_s).not_to include(message.message)
    end

    it "returns an empty list when public channels are disabled" do
      stamp_activity(public_channel, 1.hour.ago)
      SiteSetting.enable_public_channels = false

      get "/chat-channel-categories/active-channels.json"

      expect(response.status).to eq(200)
      expect(response.parsed_body["channels"]).to eq([])
    end
  end
end
