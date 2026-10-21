# Deployment

GitHub is the source of truth, GitHub Actions runs the gate, Vercel serves the
result. The `.sk` domain points at Vercel directly — there is no separate Slovak
hosting step, because a `.sk` domain is a DNS record, not a hosting location.

## Why Vercel's Git integration stays disconnected

Vercel's own integration deploys on push whether or not CI passed. For a
marketing site that is a feature. Here it would let a deploy outrun the test
suite, and the suite is what enforces the verification and maturity gates — the
checks that stop the app telling somebody they are entitled to money nobody has
confirmed.

So: import the project into Vercel, then **turn the Git integration off** and
let `.github/workflows/deploy.yml` drive it.

## One-time setup

### 1. Create the Vercel project

```bash
npm i -g vercel
vercel login
vercel link          # from the repository root; creates .vercel/
```

`vercel link` writes `.vercel/project.json` with the two IDs you need next.
That directory is gitignored on purpose — the IDs belong in secrets, not in the
repository.

### 2. Disconnect the Git integration

Vercel dashboard → the project → Settings → Git → **Disconnect**.

### 3. Add the repository secrets

GitHub → the repository → Settings → Secrets and variables → Actions:

| Secret | Where it comes from |
|---|---|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` |

And one **variable** (Variables tab, not Secrets — it is not a secret and it is
useful to see it in logs):

| Variable | Value |
|---|---|
| `PRODUCTION_URL` | `https://your-domain.sk` |

The domain lives here rather than in the workflow so that changing it, or
pointing the pipeline at a staging host, needs no commit. If it is unset the
pipeline still deploys and still smoke-tests the deployment URL — it just says
in the run summary that it could not check the domain alias.

### 4. Protect `main`

GitHub → Settings → Branches → add a rule for `main`:

- require a pull request before merging
- require the **Typecheck and tests** check to pass

Without this the gate is advisory: anybody can push straight to `main` and the
production job runs on whatever landed.

### 5. Point the domain at Vercel

```bash
vercel domains add example.sk
vercel domains inspect example.sk     # authoritative records for THIS project
```

Use what `inspect` prints rather than anything written down here — Vercel can
hand out different targets per project. At the time of writing the apex record
is an `A` to `76.76.21.21` and a subdomain is a `CNAME` to
`cname.vercel-dns-0.com`.

At the registrar (for a `.sk` domain, usually through your registrar's panel
rather than sk-nic directly):

```
@      A      76.76.21.21
www    CNAME  cname.vercel-dns-0.com
```

A `.sk` domain served from Vercel is just these two records. There is no
separate Slovak hosting step, and none is needed unless a municipality imposes
a data-location requirement in a contract — at which point it becomes a
reverse proxy in front of the same build, not a migration.

Then:

```bash
vercel certs ls          # confirm the certificate was issued
```

TLS is automatic once DNS resolves. Set the apex-vs-www redirect in the project
settings so only one of them is canonical.

## What happens on each event

| Event | Result |
|---|---|
| Pull request | typecheck + tests, then a preview deploy with its own URL |
| Push to `main` | typecheck + tests, production deploy, then two gate smoke tests |
| Tests fail | nothing deploys, on either path |

The production job smoke-tests **twice**, because they are different claims:

- against the **deployment URL**, which proves the build that just went out
  behaves
- against the **production domain**, which proves the alias actually points at
  it — an alias can be stale or misconfigured while the deployment itself is
  perfect, and the domain is the only one of the two a visitor will ever type

The production job finishes by running `scripts/smoke-gates.mjs` against the URL
it just deployed. The unit tests prove the gates hold in the repository; this
proves they hold in what actually shipped, which is a different claim — a build
step or a stray environment variable could undo them in between.

That smoke test asserts the current intended state: **nothing is verified, so
nothing is entitled.** When real benefits get verified and reviewed, the check
has to be updated alongside them. If it ever fails and you did not just verify
something, a gate has gone missing — roll back rather than deploying over it.

## Rolling back

```bash
vercel ls                        # find the previous good deployment
vercel promote <deployment-url>  # make it production again
```

Instant, because Vercel keeps every build. Faster than reverting a commit and
waiting for CI, so reach for this first and fix the repository afterwards.

## Later: Czechia

A second Vercel project from the same repository, with its own domain, built
against `src/rules/cz/`. Two projects rather than one with a flag, for the same
reason the rule packages are separate: a Czech mistake must not be able to break
Slovakia.
