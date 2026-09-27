# Public deployment

The local quick start prints `localhost` links. Those addresses work only on the computer running AnswerDrop. A public share link needs a reachable HTTPS host and persistent storage for the SQLite database.

## Linux server with a domain

The repository includes `compose.public.yaml` and `Caddyfile` for a single Linux server. Caddy terminates HTTPS; only Caddy publishes ports 80 and 443. AnswerDrop and its SQLite data stay on the private Compose network and persistent volume.

1. Point a domain such as `share.example.com` to the server's public IP. Allow inbound TCP 80/443 and UDP 443. Install Docker with Compose.
2. Clone this repository on the server. Copy `public.env.example` to `public.env`, set `ANSWERDROP_DOMAIN` to the hostname only, and set `ANSWERDROP_PUBLISH_TOKEN` to a new random value of at least 24 characters. Keep `public.env` private; it is ignored by Git. Do not reuse a token that appeared in chat, logs, or screenshots.
3. Start the stack:

   ```sh
   docker compose --env-file public.env -f compose.public.yaml up -d --build
   ```

4. Check `https://share.example.com/api/health`, then open `https://share.example.com`. Paste your Markdown, review findings, enter the publisher token, and publish. Send the resulting HTTPS link to a recipient on another device to verify access.

The public stack uses named volumes for the SQLite database and Caddy certificates. Back up the `answerdrop-data` volume regularly. Anyone with a published document's bearer link can read it; the publisher token is required to create documents. Put the token in a secret manager if your hosting platform provides one.

Existing `localhost` URLs cannot be shared by changing the hostname alone: the public server must also contain the document. Republish the original Markdown to the public server to get a new URL, or migrate the SQLite database and its assets as one unit. A document with an expiration or view limit retains those controls only when the database is migrated.

## Managed hosting

If you use a managed platform instead of a Linux server, deploy the Dockerfile as one web service, set `ANSWERDROP_BASE_URL` to its public HTTPS origin, set a fresh `ANSWERDROP_PUBLISH_TOKEN` as a secret, and mount a persistent disk at `/app/data`. Do not use an ephemeral filesystem for documents: redeploys and restarts would lose the SQLite database. The service must listen on the platform's `PORT` and `0.0.0.0`.
