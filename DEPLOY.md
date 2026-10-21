# Deployment

GitHub is the source of truth, GitHub Actions runs the gate, GitHub Pages serves
the result on `mojedavky.sk`. No third-party host and no server.

## Why no server at all

The app bundles the engine into the page and runs the whole screening in the
browser. Nothing personal is ever sent anywhere, so a static host is not just
sufficient — it is better. No server means no server that could log, cache or
leak somebody's income and household composition.

It also makes the hosting-location question dissolve. There is no point arguing
about which country the files sit in when the files are a questionnaire and the
answers never leave the phone.

Vercel was in the original plan and is not needed. It would add an account, a
token to rotate, three repository secrets and a second place where deployments
can happen — in exchange for serverless functions this product does not use.

## One-time setup

### 1. Turn on Pages, built by Actions

Repository → Settings → Pages → **Source: GitHub Actions**.

Not "Deploy from a branch". The workflow publishes the built `dist/`, so there
is no `gh-pages` branch and no build output in git.

### 2. Set the custom domain

Settings → Pages → Custom domain → `mojedavky.sk` → Save.

Then tick **Enforce HTTPS**. The checkbox can take up to 24 hours to become
available after DNS resolves, and until then the site is reachable over plain
HTTP — so check back for it rather than assuming.

Note: with an Actions-published site, GitHub does **not** create a `CNAME` file
and ignores one if it exists. The domain lives in the Pages setting only. There
is deliberately no `CNAME` file in this repository.

### 3. DNS at the registrar

For the apex domain, four `A` records:

```
@   A   185.199.108.153
@   A   185.199.109.153
@   A   185.199.110.153
@   A   185.199.111.153
```

Optionally the IPv6 equivalents as well, which GitHub recommends alongside the
`A` records rather than instead of them:

```
@   AAAA   2606:50c0:8000::153
@   AAAA   2606:50c0:8001::153
@   AAAA   2606:50c0:8002::153
@   AAAA   2606:50c0:8003::153
```

GitHub's own documentation suggests a `CNAME` for `www`, and on many registrars
that is the better record. It is not an option at every one of them. WebSupport,
where this domain lives, refuses a `CNAME` at a name that already has records —
and a wildcard `*` record counts, so the conflict shows up even when nothing
named `www` is visible in the zone.

The way out is the same four `A` records again, which work everywhere:

```
www   A   185.199.108.153
www   A   185.199.109.153
www   A   185.199.110.153
www   A   185.199.111.153
```

Eight GitHub records in all, four on the apex and four on `www`. Add them; do
not rename the apex ones, or the apex stops resolving.

Do not point `www` at the `*.pages.github.io` address shown in the Pages
settings panel.

Leave every mail record alone. On this zone that means `admin`, `mail`,
`webmail`, `smtp`, `pop3` and `imap`, plus the `autodiscover` and `autoconfig`
aliases. Repointing the apex does not touch mail, but repointing `MX` or those
hosts does, and the failure is silent until somebody's mail bounces.

### 4. One repository variable

Settings → Secrets and variables → Actions → **Variables**:

| Variable | Value |
|---|---|
| `PRODUCTION_URL` | `https://mojedavky.sk` |

A variable rather than a secret, because it is not one and it is useful to see
it in the logs. It lives here rather than in the workflow so changing the domain
needs no commit. If unset the pipeline still deploys; it just says in the run
summary that it could not verify the domain.

No secrets are needed at all. Pages deploys with the workflow's own
`GITHUB_TOKEN`, so there is no token to create, store or rotate.

### 5. Protect `main`

Settings → Branches → add a rule for `main`:

- require a pull request before merging
- require the **Typecheck, tests and build** check to pass

Without this the gate is advisory: anybody can push straight to `main` and the
deploy runs on whatever landed.

## What happens on each event

| Event | Result |
|---|---|
| Pull request | typecheck, tests, build with its size budget — no deploy |
| Push to `main` | the same, then publish to Pages, then smoke-test the live site |
| Tests or budget fail | nothing deploys |

The build enforces a bundle size budget and fails over it. That is not fussiness:
part of the audience opens this on an old phone on metered data, and a bundle
that drifts into hundreds of kilobytes is a real barrier to them.

### The smoke test

After publishing, `scripts/smoke-site.mjs` fetches the live site and checks that
the right files are actually being served at the right address. The unit tests
prove the app behaves in a test DOM; this proves the deployment is real — a
build can be perfect while DNS points at a parking page, the custom domain was
never saved, or an old deployment is still live.

It also checks two things that would be quiet failures: that the bundle contains
the rules at all, and that it carries no development-mode marker, since
development mode is what switches the verification and maturity gates off.

It distinguishes three outcomes, because "no certificate yet" and "the site is
wrong" deserve different reactions:

| Exit | Meaning | The run |
|---|---|---|
| 0 | everything served and correct | passes |
| 3 | correct over HTTP, but TLS refused | passes, with a warning in the summary |
| 1 | wrong, missing, or a placeholder page | fails |

Exit 3 is the first hours after a domain is attached, while GitHub provisions
the certificate. Failing the run for that would teach everybody to ignore a red
build, which costs more than it saves. It is not a blanket exemption: the site
still has to serve the right content over HTTP, so a broken deployment fails
whether or not TLS is up.

Run it against anything, including a local build:

```bash
npm run build
cd dist && python3 -m http.server 8000 &
node scripts/smoke-site.mjs http://localhost:8000
```

## Rolling back

Re-run an older successful **Deploy** workflow from the Actions tab, or revert
the commit and push. Pages serves whatever the last successful run published.

Reverting is the honest option here. Unlike a platform with stored immutable
builds, Pages has no one-command promote, so keep `main` deployable rather than
relying on a rollback button.

## Later: Czechia

A second repository, or a second workflow in this one publishing a different
build from `src/rules/cz/` to a second Pages site and domain. Separate, for the
same reason the rule packages are separate: a Czech mistake must not be able to
break Slovakia.
