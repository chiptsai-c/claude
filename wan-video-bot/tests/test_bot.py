"""Conversation-flow test for bot.py with Telegram and ComfyUI mocked out."""

import asyncio
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["ALLOWED_USER_IDS"] = "111"
import bot  # noqa: E402


def make_update(user_id=111, text=None, caption=None, with_photo=False, msg_id=1):
    tg_file = MagicMock()
    tg_file.file_path = "photos/file.jpg"
    tg_file.download_to_drive = AsyncMock(side_effect=lambda p: open(p, "wb").write(b"jpg"))
    photo = MagicMock()
    photo.get_file = AsyncMock(return_value=tg_file)
    msg = MagicMock()
    msg.text, msg.caption, msg.chat_id, msg.message_id = text, caption, 5, msg_id
    msg.photo = [photo] if with_photo else []
    msg.reply_text = AsyncMock(return_value=MagicMock(edit_text=AsyncMock()))
    msg.reply_video = AsyncMock()
    return SimpleNamespace(message=msg, effective_user=SimpleNamespace(id=user_id, username="u"))


def fake_render(path, prompt, out, progress):
    open(out, "wb").write(b"video")
    return out


class BotFlowTest(unittest.TestCase):
    def run_(self, coro):
        return asyncio.run(coro)

    def test_photo_then_prompt_renders(self):
        ctx = SimpleNamespace(user_data={})
        with patch.object(bot.backend, "generate_video", side_effect=fake_render) as gen:
            self.run_(bot.photo(make_update(with_photo=True), ctx))
            self.assertIn("photo", ctx.user_data)
            self.run_(bot.text(u := make_update(text="slow zoom in", msg_id=2), ctx))
        gen.assert_called_once()
        self.assertEqual(gen.call_args.args[1], "slow zoom in")
        u.message.reply_video.assert_awaited_once()
        self.assertNotIn("photo", ctx.user_data)
        self.assertFalse(os.path.exists(gen.call_args.args[0]))  # photo cleaned up

    def test_caption_renders_immediately(self):
        ctx = SimpleNamespace(user_data={})
        with patch.object(bot.backend, "generate_video", side_effect=fake_render) as gen:
            self.run_(bot.photo(u := make_update(with_photo=True, caption="waves"), ctx))
        self.assertEqual(gen.call_args.args[1], "waves")
        u.message.reply_video.assert_awaited_once()

    def test_text_without_photo_asks_for_photo(self):
        u = make_update(text="hello")
        self.run_(bot.text(u, SimpleNamespace(user_data={})))
        self.assertIn("photo", u.message.reply_text.call_args.args[0])

    def test_stranger_blocked(self):
        ctx = SimpleNamespace(user_data={})
        with patch.object(bot.backend, "generate_video") as gen:
            self.run_(bot.photo(u := make_update(user_id=999, with_photo=True, caption="x"), ctx))
        gen.assert_not_called()
        self.assertIn("999", u.message.reply_text.call_args.args[0])

    def test_daily_limit(self):
        ctx = SimpleNamespace(user_data={})
        with patch.object(bot, "MAX_PER_DAY", 1), patch.dict(bot.usage, {"day": None, "count": 0}), \
                patch.object(bot.backend, "generate_video", side_effect=fake_render) as gen:
            self.run_(bot.photo(make_update(with_photo=True, caption="a"), ctx))
            self.run_(bot.photo(u := make_update(with_photo=True, caption="b", msg_id=2), ctx))
        self.assertEqual(gen.call_count, 1)
        self.assertIn("Daily limit", u.message.reply_text.call_args.args[0])

    def test_render_error_reported(self):
        ctx = SimpleNamespace(user_data={})
        with patch.object(bot.backend, "generate_video", side_effect=bot.ComfyError("GPU out of memory")):
            self.run_(bot.photo(u := make_update(with_photo=True, caption="x"), ctx))
        self.assertIn("GPU out of memory", u.message.reply_text.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
