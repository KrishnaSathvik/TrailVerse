# Email ChatGPT link update — October 15, 2026

Final scope after user correction: preserve existing email copy and layouts. Add only the ChatGPT icon and “Open TrailVerse in ChatGPT” link to the welcome and feature-announcement emails. Use the supplied URL:

https://chatgpt.com/plugins/plugin_asdk_app_69e9c67943c08191a37c464b803ebdbe

The announcement uses its existing inline link. The welcome email has a simple centered link below its existing primary button. No new promotional card, additional destination links, or sample prompts remain. The older HTML templates retain their original layout with the same minimal link addition.

All nine active React email previews render successfully. Welcome and announcement previews were checked for the icon and direct link and the absence of the extra content. Generate previews locally, without sending email:

```sh
cd server
node scripts/preview-transactional-emails.js
```

The first set of nine test emails was sent to the user before this correction. Corrected local previews are in `server/templates/emails/preview-*.html`.

Deploy `/brand/chatgpt.png` with the frontend before sending emails that reference its public URL. The ChatGPT page retains its `NEXT_PUBLIC_CHATGPT_APP_URL` override.

Icon source: OpenAI mark from Simple Icons 13.0.0 (`https://github.com/simple-icons/simple-icons/blob/13.0.0/icons/openai.svg`), rasterized as a 96px PNG for email compatibility. Simple Icons is CC0; brand marks remain subject to their owners’ trademark rights.
