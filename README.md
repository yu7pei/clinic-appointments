# Clinic Appointment System — Backend

A small RESTful API for a simplified clinic appointment system: patients book
appointments, clinicians view their schedule, and admins list upcoming ones.

- **TypeScript + Fastify** with three REST endpoints and a single, well-tested
  overlap rule.
- **Prevents double-booking a clinician** — the core invariant of the system.
- **SQLite over an in-memory store**, chosen mainly for correctness under
  concurrency: a database transaction makes booking atomic, so two requests
  racing for the same slot cannot both succeed (see
  [Concurrency and race conditions](#concurrency-and-race-conditions)).
- **Input validation** (timezone-aware ISO datetimes, `start < end`, no past
  dates) with meaningful HTTP status codes.
- **Bonus included:** Swagger/OpenAPI docs, simulated role-based access,
  Docker + docker-compose, and GitHub Actions CI.

---

## Quick start

Requires **Node ≥ 20** (developed on Node 22 — see `.nvmrc`).

```bash
npm install
npm run dev          # start with hot reload on http://localhost:3000
# or
npm run build && npm start
```

Data is persisted to a local **SQLite** database (`./data/clinic.db` by default;
set `DATABASE_PATH` to change it). The schema is created automatically on first
run.

Interactive API docs (OpenAPI/Swagger) are served at **http://localhost:3000/docs**.

### Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `./data/clinic.db` | SQLite database file |

### Tests

```bash
npm test             # run the suite once
npm run test:watch   # watch mode
npm run test:coverage # coverage report (v8)
npm run typecheck    # tsc --noEmit, strict
```

`npm test` runs against an isolated in-process SQLite database (`:memory:`), so
it is fast and needs no setup. The project is tested at several levels:

| Level | Where | What it checks |
| --- | --- | --- |
| **Unit** | `tests/overlap.test.ts` | The overlap rule in isolation — a boundary table (containment, partial, touching, one-millisecond) |
| **Integration** | `tests/appointments.test.ts` | The full HTTP stack via Fastify `inject` — every endpoint, validation, role guard, error mapping |
| **Repository** | `tests/sqlite-repository.test.ts` | The SQLite implementation directly, including a 50-way concurrent-booking race |
| **API / E2E** | `postman/` via Newman | A running server end-to-end (`npm run test:api`) — also runs in CI |

All four levels run automatically in CI on every push (see
`.github/workflows/ci.yml`).

### Postman collection

A runnable collection lives in [`postman/`](./postman). It covers every
endpoint with assertions and chains data between requests (it generates a
*future* booking window in a pre-request script, then reuses the booked slot to
prove the 409 overlap path). Import `postman/clinic-appointments.postman_collection.json`
into Postman, or run it headless against a running server:

```bash
npm run dev            # in one terminal
npm run test:api       # in another — runs the collection via Newman
```

### Docker

`docker compose up` builds the image and runs the API with SQLite persisted on a
named volume, so data survives container restarts:

```bash
docker compose up --build      # API on http://localhost:3000
docker compose down            # stop (add -v to also wipe the data volume)
```

---

## API

| Method | Path | Description | Auth (simulated) |
| --- | --- | --- | --- |
| `POST` | `/appointments` | Book an appointment | — |
| `GET` | `/clinicians/:id/appointments` | A clinician's upcoming appointments | — |
| `GET` | `/appointments` | All upcoming appointments | `admin` only |
| `GET` | `/docs` | Swagger UI | — |

`GET` list endpoints accept optional `from`, `to` (ISO 8601 datetimes) and
`limit`, `offset` for paging.

Role is simulated via an `X-Role: admin|clinician|patient` header (or `?role=`
query param). A real system would derive it from a verified token.

### Example requests

```bash
# Create an appointment -> 201
curl -i -X POST http://localhost:3000/appointments \
  -H 'content-type: application/json' \
  -d '{"clinicianId":"c1","patientId":"p1","start":"2027-01-01T09:00:00Z","end":"2027-01-01T09:30:00Z"}'

# Overlapping time for the same clinician -> 409 Conflict
curl -i -X POST http://localhost:3000/appointments \
  -H 'content-type: application/json' \
  -d '{"clinicianId":"c1","patientId":"p2","start":"2027-01-01T09:15:00Z","end":"2027-01-01T09:45:00Z"}'

# Back-to-back (touching endpoints) -> 201, allowed
curl -i -X POST http://localhost:3000/appointments \
  -H 'content-type: application/json' \
  -d '{"clinicianId":"c1","patientId":"p2","start":"2027-01-01T09:30:00Z","end":"2027-01-01T10:00:00Z"}'

# Invalid input (timezone-naive datetime) -> 400
curl -i -X POST http://localhost:3000/appointments \
  -H 'content-type: application/json' \
  -d '{"clinicianId":"c1","patientId":"p1","start":"2027-01-01T09:00:00","end":"2027-01-01T09:30:00"}'

# A clinician's upcoming schedule, within a window
curl 'http://localhost:3000/clinicians/c1/appointments?from=2027-01-01T00:00:00Z&to=2027-01-02T00:00:00Z'

# Admin: all upcoming appointments
curl 'http://localhost:3000/appointments' -H 'X-Role: admin'
```

### Error shape

Every error uses one envelope:

```json
{ "error": { "code": "CONFLICT", "message": "...", "details": "..." } }
```

| Status | When |
| --- | --- |
| `400` | Invalid input (bad/naive datetime, `start >= end`, past appointment, bad query) |
| `403` | Role not permitted (e.g. non-admin calling `GET /appointments`) |
| `409` | Requested time overlaps an existing appointment for that clinician |
| `201` / `200` | Success |

---

## Validation rules

- `start` and `end` must be **ISO 8601 datetimes with a timezone** (`Z` or
  `±hh:mm`). Timezone-naive strings are rejected (see design notes).
- `start` must be **strictly before** `end` — zero-length and negative-length
  intervals are invalid.
- **Overlap** uses half-open intervals `[start, end)`: `start < other.end &&
  end > other.start`. Touching at an endpoint (`end == other.start`) is allowed,
  so back-to-back bookings are fine.
- Appointments **in the past are rejected**.

---

## Architecture

The code is split into layers whose dependencies point **inward**: the HTTP edge
depends on the application core, never the other way round. A request flows
through them in one direction:

```
HTTP  →  controllers  →  services  →  repository  →  SQLite
```

| Layer (`src/`) | Responsibility | Key files |
| --- | --- | --- |
| `controllers/` | HTTP routing, status codes | `appointment.controller.ts`, `clinician.controller.ts` |
| `services/` | Use-case orchestration: time parsing, past-date policy | `appointment.service.ts` |
| `repository/` | Persistence behind an interface | `appointment-repository.ts` (interface), `sqlite-appointment-repository.ts`, `actor-store.ts` |
| `domain/` | Pure business core, no framework imports | `overlap.ts` (the collision rule), `appointment.ts`, `clock.ts`, `errors.ts` |
| `middleware/` | Cross-cutting HTTP concerns | `error-handler.ts`, `role-guard.ts` |
| `dto/` | Request validation and wire mapping | `schemas.ts` (Zod), `appointment.dto.ts` |

`app.ts` is the composition root that wires these together; `config.ts` and
`server.ts` handle configuration and startup.

Two consequences of this shape are worth calling out:

- **The domain is pure.** `domain/` has no framework imports — the overlap rule
  is a plain function, so it is trivial to unit-test and reason about.
- **Persistence is swappable.** Services depend only on the
  `AppointmentRepository` interface, not on SQLite, so moving to Postgres later
  is another implementation of that interface with nothing above it changing.

---

## Design decisions & trade-offs

### Storage: SQLite, not an in-memory store

My first instinct was to keep everything in memory: it's the least code, nothing
to maintain, no Docker needed, and it's easy to extend. But the heart of this
problem is correctness under concurrency — stopping the same clinician's slot
from being booked twice when two requests arrive at once. A relational database
gives me that through a transaction, whereas an in-memory store would mean
writing and maintaining my own locking. The database's atomicity is a stronger
and simpler foundation than application-level concurrency code, so I went with
SQLite, where a transaction makes the check-and-insert atomic and there is no
lock of my own to maintain (the mechanism is described in
[Concurrency and race conditions](#concurrency-and-race-conditions)). The
`AppointmentRepository` interface keeps this swappable — moving to Postgres later
is another class and nothing above it changes.

### No idempotency layer

I considered making the create endpoint idempotent.
Working through it, the endpoint's own shape already covers the case that
matters: a booking is identified by (clinician, time window), and the overlap
rule plus the atomic transaction make a duplicate of the same slot impossible. A
separate idempotency key would add machinery without preventing anything the
existing constraints don't already prevent. Where idempotency genuinely earns
its place — payments and similar operations with no natural uniqueness — I'd
enforce it with a unique key in the database.

### Timezones: reject ambiguous input

ISO 8601 allows timezone-naive strings like `2026-06-25T09:00:00`, and
`new Date()` would read those in the server's local zone, so the same request
could give different overlap results on different machines. Rather than guess,
the API rejects datetimes without a timezone (400) and stores everything as UTC
epoch milliseconds, so comparisons are unambiguous and reproducible.

### The overlap rule

The whole problem reduces to one predicate, so it lives in a single pure
function (`domain/overlap.ts`) and nothing else re-implements it. Appointments
are half-open intervals `[start, end)`: `start < other.end && end > other.start`.
That is what makes back-to-back bookings legal — when one ends exactly as the
next starts, they do not overlap. It has a boundary-focused test table
(containment, partial overlap on each side, touching on each side, one-millisecond
overlap) rather than a single happy-path check.

### Why Fastify

I wanted a modern, TypeScript-first framework rather than reaching for Express
out of habit. Fastify treats schema-based validation as a first-class feature,
so one Zod schema drives the request validation, the static types in the
handlers, and the generated OpenAPI docs at `/docs` — there is no drift between
the three. It is async-native and faster than Express, with maintained
first-party plugins (swagger, etc.). Nest would have been the heavier, more
opinionated alternative; for a service this size Fastify is the right amount of
structure.

### Auto-creating actors

The brief allows either rejecting unknown clinicians/patients or auto-creating
them. I auto-create on first reference so the examples run without a seeding
step. With real users I'd flip this: actors would come from a registration flow
and an unknown id would be a 404.

---

## Concurrency and race conditions

Booking is a check-then-insert ("is the slot free?", then "take it"), and the
gap between those two steps is a race: two requests for the same clinician could
both see a free slot and both insert, producing a double booking. This is handled
at the **database level**:

- The overlap check and the insert run inside a single SQLite transaction,
  started with **`BEGIN IMMEDIATE`** (`createIfNoOverlap` in
  `src/repository/sqlite-appointment-repository.ts`).
- `BEGIN IMMEDIATE` takes the write lock up front, and SQLite allows only one
  writer at a time, so the two transactions are **serialised, not interleaved**.
- The second request therefore runs its check *after* the first has committed,
  sees the new row, and returns **409 Conflict** instead of inserting a duplicate.
- `better-sqlite3` is synchronous too, so within one process there is no `await`
  between the check and the insert for the event loop to interleave on.

Two simultaneous bookings for the same slot play out like this:

```
A: BEGIN IMMEDIATE  → gets the write lock
A:   check → free → insert → COMMIT  (releases the lock)
B: BEGIN IMMEDIATE  → waits for the lock …
B:   check → sees A's row → ConflictError → 409
```

`tests/sqlite-repository.test.ts` proves it: 50 identical bookings fired at once,
asserting exactly one `201` and 49 conflicts.

**Scope and evolution.** SQLite's lock spans a single host (including across
processes), but not a multi-node cluster. The fully declarative form is a
Postgres exclusion constraint, which makes overlapping rows physically impossible
no matter how many app servers race:

```sql
EXCLUDE USING gist (clinician_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
```

Because persistence sits behind the `AppointmentRepository` interface, adopting
that is another implementation with nothing above it changing — the application
lock, the SQLite transaction, and the DB constraint are the same idea at three
levels.

