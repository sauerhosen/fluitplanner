# Hockey.nl Match Center API reference

Status: reverse-engineered, unofficial, and verified against the live public web application on 2026-08-15.

This document describes the API used by the public [Hockey.nl Match Center](https://www.hockey.nl/match-center). It is intended as a technical reference for coding agents and developers building personal adapters, calendar feeds, TRMNL screens, dashboards, match trackers, and similar read-oriented integrations.

The API is not publicly documented or presented as a supported KNHB developer API. Treat every route and field as an implementation detail that may change without notice.

## 1. Executive summary

The Match Center is a Vue application embedded in `www.hockey.nl`. The application is delivered as custom elements from `mc.static-hw.nl` and reads structured JSON from a separate API:

```text
Website shell:  https://www.hockey.nl/match-center
Stable loader:  https://mc.static-hw.nl/v2/match-center.js
API base URL:   https://app.hockeyweerelt.nl
API version:    7, sent as X-HAPI-Version: 7
```

The useful public data includes:

- Clubs and business clubs
- Club contact and venue information
- Field, indoor, and business teams
- National and international competitions
- Poules, standings, programmes, and results
- Match details, scores, locations, remarks, and live actions
- Facilities, coordinates, and facility schedules
- A curated default set of matches and competitions

The API does not accept unsigned anonymous requests. The public web application creates an anonymous device identity, obtains a device token, and signs each request. A normal user login adds an OIDC bearer token for account-specific operations.

Browser-based applications hosted outside `https://www.hockey.nl` cannot normally call the API directly because CORS preflights from other origins are not allowed. Build adapters as server-side services, serverless functions, scheduled jobs, or local processes.

## 2. Provenance and confidence levels

The findings in this document come from three sources:

1. The public Match Center UI and its fragment routes.
2. The stable loader at `https://mc.static-hw.nl/v2/match-center.js` and the application bundle it referenced on 2026-08-15: `main.ce-DNvnON6S.js`.
3. Read-only probes of representative live API endpoints using the same anonymous device flow as the public application.

Endpoint tables use these confidence labels:

- **Live verified**: exercised successfully against the live API.
- **Client verified**: present in the current public client source, but not exercised when doing so would mutate account data.
- **Observed restriction**: deliberately exercised only far enough to determine its authentication requirement.

Live counts, names, IDs, schedules, and bundle hashes are snapshots, not contracts.

## 3. System architecture

```text
www.hockey.nl
  └─ loads <match-center> from mc.static-hw.nl/v2/
       ├─ uses fragment routes such as #/club/HH11PD0
       ├─ persists anonymous device credentials in localStorage
       ├─ detects an OIDC user token in sessionStorage when signed in
       └─ calls https://app.hockeyweerelt.nl
            ├─ clubs and teams
            ├─ competitions and poules
            ├─ matches and actions
            ├─ facilities
            └─ favourites and account-specific match collections
```

The website route and the API route are different things. For example:

```text
Web route: https://www.hockey.nl/match-center#/match/2079156
API route: https://app.hockeyweerelt.nl/matches/2079156
```

## 4. Identifiers and relationships

Several identifier domains coexist. Do not assume that IDs from different domains are interchangeable.

| Entity                    |                  Identifier | Example       | Notes                                                                 |
| ------------------------- | --------------------------: | ------------- | --------------------------------------------------------------------- |
| Club                      | String federation reference | `HH11PD0`     | Used by `/clubs/{id}` and club fragment routes.                       |
| Team                      |                     Integer | `774`         | SCHC D1 in the verified sample.                                       |
| Poule                     |                     Integer | `180863`      | A season/competition grouping. Changes across seasons and cup phases. |
| Team route                |             Compound string | `774\|180863` | UI convention: `{teamId}\|{pouleId}`. Not an API identifier.          |
| National competition      |                     Integer | `1` or `2`    | Top-level competition record. Contains one or more poules.            |
| International team        |                     Integer | `2`           | Example: Oranje Heren.                                                |
| International competition |                     Integer | `47`          | Example from the verified 2026 competition data.                      |
| Match                     |                     Integer | `2079156`     | National and international IDs use separate API route families.       |
| Facility                  |                     Integer | `281`         | Used by facility schedule endpoints.                                  |
| Favourite                 |                     Integer | `3906901`     | Account/default favourite record, not the target entity ID.           |
| Match action              |                     Integer | `588345`      | Event within a detailed match record.                                 |

Important relationship rules:

- A club owns many teams.
- A team can participate in multiple historical or concurrent poules.
- `team.recent_poule_id` points at the most relevant recent poule, but should not be treated as permanently stable.
- A poule contains standings and matches.
- A top-level national competition contains multiple poules, often including previous periods or knockout phases.
- A match embeds team summaries rather than only team IDs.
- Match-list records often embed enough location data for display, but not necessarily the facility ID. Facility discovery may require matching against `/facilities`.

## 5. Authentication model

### 5.1 Anonymous device registration

Before calling normal API routes, create an anonymous device record.

```http
POST /device/register
Accept: application/json
Content-Type: application/json
X-Requested-With: XMLHttpRequest

{
  "uuid": "<random UUID>",
  "os": "Web"
}
```

The response is a JSON object containing a `token` string. Store the UUID and token together. The token is used in `X-HAPI-Authorization`; the UUID is an input to every request signature.

The web client persists them under these local-storage keys:

```text
mcStore_deviceUUID
mcStore_deviceApiToken
```

Do not log or commit either value. Although the registration is anonymous, the pair functions as an access credential.

### 5.2 Signed request headers

Every route except `/device/register` receives these headers:

```http
Accept: application/json
Content-Type: application/json
X-Requested-With: XMLHttpRequest
X-HAPI-Authorization: <device token>
X-HAPI-Timestamp: <Unix time in whole seconds>
X-HAPI-Signature: <lowercase SHA-1 hex digest>
X-HAPI-Version: 7
```

The public client also sends `Access-Control-Allow-Origin: *` as a request header. That is not how CORS is granted and is unnecessary for a server-side client; omit it unless exact client parity is required.

### 5.3 Signature algorithm

Given an endpoint such as:

```text
/poules/180863?filter[dateStart]=2026-09-27&filter[dateEnd]=2026-10-05
```

the client builds the signature as follows:

1. Parse the endpoint relative to `https://app.hockeyweerelt.nl`.
2. Remove every character from the URL pathname except ASCII letters, digits, `-`, and `/`.
3. Iterate query pairs in URL order.
4. Sanitize each query key and value by removing every character except ASCII letters, digits, `-`, `/`, and `=`.
5. Render each pair as `key=value` and concatenate all pairs without `&` or another separator.
6. Reverse the UUID as a string.
7. Concatenate:

   ```text
   timestamp + sanitizedPath + concatenatedQueryPairs + reversedUUID
   ```

8. UTF-8 encode that string.
9. SHA-1 hash the bytes and render lowercase hexadecimal.

For the example query, the square brackets are removed from the signature input:

```text
filterdateStart=2026-09-27filterdateEnd=2026-10-05
```

Query order therefore affects the signature. Construct the URL and signature from the same ordered query representation.

### 5.4 Signed-in user requests

When the web client detects a signed-in user, it adds:

```http
Authorization: Bearer <OIDC id_token>
```

The current client scans session-storage keys beginning with `oidc.user:https://`, parses the stored OIDC object, and uses its `id_token`. It also stores session flags under:

```text
mcStore_bearerToken
mcStore_loggedIn
```

Do not extract a browser user's token for an adapter. Use an official login flow if account-specific access is ever implemented. Public/read-only adapters should stay on the anonymous-device tier.

### 5.5 Authentication failure behavior

Observed and client-defined behavior:

- An unsigned `GET /clubs` returns `401` with `{"message":"Unauthenticated"}`.
- On the first `401`, the web client discards its device token, registers again, and retries the request once.
- A second `401` clears the user's logged-in session state.
- A device-signed but user-unsigned `GET /my-matches` returned `403` with `{"message":"This action is unauthorized."}`.
- A fresh device-signed `GET /favorites` returned `200` with an empty `data` array.

## 6. Minimal Node.js signing client

This example mirrors the public client closely enough for a server-side proof of concept. Node.js 18 or later is assumed.

```js
import { createHash, randomUUID } from "node:crypto";

const API_BASE = "https://app.hockeyweerelt.nl";

export class HockeyMatchCenterClient {
  constructor({ uuid = randomUUID(), token = null } = {}) {
    this.uuid = uuid;
    this.token = token;
  }

  async register() {
    const response = await fetch(`${API_BASE}/device/register`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ uuid: this.uuid, os: "Web" }),
    });

    if (!response.ok) {
      throw new Error(`Device registration failed: HTTP ${response.status}`);
    }

    const body = await response.json();
    this.token = body.token;
    return { uuid: this.uuid, token: this.token };
  }

  signedHeaders(endpoint, bearerToken = null) {
    if (!this.token) throw new Error("Register the device first");

    const url = new URL(endpoint, API_BASE);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = url.pathname.replace(/[^a-zA-Z0-9\-/]+/g, "");
    const query = Array.from(url.searchParams.entries())
      .filter(([key]) => key.length > 0)
      .map(([key, value]) => {
        const cleanKey = key.replace(/[^a-zA-Z0-9\-/=]+/g, "");
        const cleanValue = value.replace(/[^a-zA-Z0-9\-/=]+/g, "");
        return `${cleanKey}=${cleanValue}`;
      })
      .join("");

    const reversedUuid = this.uuid.split("").reverse().join("");
    const input = `${timestamp}${path}${query}${reversedUuid}`;
    const signature = createHash("sha1").update(input, "utf8").digest("hex");

    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-HAPI-Authorization": this.token,
      "X-HAPI-Timestamp": timestamp,
      "X-HAPI-Signature": signature,
      "X-HAPI-Version": "7",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    };
  }

  async request(endpoint, { method = "GET", body, bearerToken } = {}) {
    if (!this.token) await this.register();

    const execute = () =>
      fetch(new URL(endpoint, API_BASE), {
        method,
        headers: this.signedHeaders(endpoint, bearerToken),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    let response = await execute();
    if (response.status === 401) {
      this.token = null;
      await this.register();
      response = await execute();
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? `HTTP ${response.status}`);
    }
    return payload.data;
  }
}
```

Production adapters should additionally persist the UUID/token pair securely, add timeouts, cap retries, cache responses, identify their own user agent, and treat every response as untrusted input.

## 7. Response envelope

Successful routes consistently returned:

```json
{
  "data": "<route-specific object or array>"
}
```

Errors returned an object with a `message` string and no `data` property:

```json
{
  "message": "Unauthenticated"
}
```

No pagination metadata was observed. Large collections are returned as complete arrays.

## 8. Endpoint catalog

### 8.1 Device and account context

| Method   | Path                          | Access                          | Confidence           | Purpose                                                                    |
| -------- | ----------------------------- | ------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `POST`   | `/device/register`            | None                            | Live verified        | Create an anonymous web-device token.                                      |
| `GET`    | `/favorites/defaults`         | Device                          | Live verified        | Curated default favourite records.                                         |
| `GET`    | `/favorites/defaults/matches` | Device                          | Live verified        | Matches for the curated default set.                                       |
| `GET`    | `/favorites`                  | Device; richer with user bearer | Live verified        | Current favourite records. Fresh anonymous device returned an empty array. |
| `GET`    | `/my-matches`                 | User bearer                     | Observed restriction | Account-specific match collection. Device-only request returned `403`.     |
| `POST`   | `/favorites/team`             | User bearer                     | Client verified      | Add a team favourite.                                                      |
| `POST`   | `/favorites/competition`      | User bearer                     | Client verified      | Add a competition favourite.                                               |
| `DELETE` | `/favorites/{favoriteId}`     | User bearer                     | Client verified      | Remove a favourite record.                                                 |

Favourite request bodies used by the current client:

```json
{
  "team_id": 774,
  "international": 0
}
```

or:

```json
{
  "competition_id": 2,
  "international": 0
}
```

`international` is sent as integer `0` or `1`, not as a JSON boolean.

### 8.2 Clubs and teams

| Method | Path                               | Access | Confidence    | Purpose                                                                       |
| ------ | ---------------------------------- | ------ | ------------- | ----------------------------------------------------------------------------- |
| `GET`  | `/clubs`                           | Device | Live verified | Return all regular and business clubs.                                        |
| `GET`  | `/clubs/{federationReferenceId}`   | Device | Live verified | Return club details and all teams.                                            |
| `GET`  | `/poules/{pouleId}/teams/{teamId}` | Device | Live verified | Return a team, its poule history, and the selected poule's standings/matches. |

There is no server-side club search in the current client. The UI downloads `/clubs`, excludes `type === "business"` for its normal-club tab, and filters `friendly_name` locally. Its business tab uses the same endpoint and keeps `type === "business"`.

The UI groups club teams using these hockey-type codes:

| Code            | UI meaning                                                       |
| --------------- | ---------------------------------------------------------------- |
| `VE`            | Veldteams / field hockey                                         |
| `ZA`            | Zaalteams / indoor hockey                                        |
| `BH`            | Bedrijfsteams / business hockey                                  |
| `international` | International representative team; observed in favourite records |

### 8.3 Competitions and poules

| Method | Path                                                        | Access | Confidence    | Purpose                                                     |
| ------ | ----------------------------------------------------------- | ------ | ------------- | ----------------------------------------------------------- |
| `GET`  | `/competitions/national`                                    | Device | Live verified | List top-level national competitions.                       |
| `GET`  | `/competitions/national/{competitionId}`                    | Device | Live verified | Competition detail with its poules, standings, and matches. |
| `GET`  | `/poules/{pouleId}`                                         | Device | Live verified | One poule with competition context, standings, and matches. |
| `GET`  | `/competitions/international/{competitionId}`               | Device | Live verified | International competition with standings and matches.       |
| `GET`  | `/competitions/international/{competitionId}/team/{teamId}` | Device | Live verified | International team plus the selected competition.           |

Supported-looking date filters used by the public widgets:

```text
filter[dateStart]=YYYY-MM-DD
filter[dateEnd]=YYYY-MM-DD
```

Example:

```text
/poules/180863?filter[dateStart]=2026-09-27&filter[dateEnd]=2026-10-05
```

Observed behavior:

- The poule endpoint reduced 132 matches to 12 for the verified date window.
- The international competition endpoint accepted the same parameters but still returned all 50 matches in the verified sample. Always apply a client-side date filter as a defensive fallback.
- The current international widget passes these filters directly to `/competitions/international/{id}`.

### 8.4 Matches

| Method | Path                               | Access | Confidence    | Purpose                                                       |
| ------ | ---------------------------------- | ------ | ------------- | ------------------------------------------------------------- |
| `GET`  | `/matches/{matchId}`               | Device | Live verified | National match detail, including actions and approval fields. |
| `GET`  | `/matches/international/{matchId}` | Device | Live verified | International match detail.                                   |

List records embedded in competition, poule, favourite, and facility responses usually omit `actions`, `videos`, and approval fields. Fetch the match-detail route when those fields are required.

### 8.5 Facilities

| Method | Path                                                                         | Access | Confidence    | Purpose                                               |
| ------ | ---------------------------------------------------------------------------- | ------ | ------------- | ----------------------------------------------------- |
| `GET`  | `/facilities`                                                                | Device | Live verified | List facilities and structured addresses/coordinates. |
| `GET`  | `/facilities/{facilityId}/matches?filter[dateStart]=...&filter[dateEnd]=...` | Device | Live verified | Return one facility and matches in the date window.   |

The Match Center location search downloads all facilities, filters by facility `name` locally, and groups by `address.city`.

## 9. Core data model

The following TypeScript-style interfaces describe the union of fields observed in the live samples. Fields can be absent or `null` depending on endpoint, match type, competition, status, and account context. Consumers should validate at runtime and ignore unknown fields.

### 9.1 Common summaries

```ts
type ISODateTime = string;

interface TeamSummary {
  id: number;
  name: string;
  short_name: string | null;
  logo: string | null;
  hockey_type: "VE" | "ZA" | "BH" | "international" | null;
  category_group_name?: string | null;
  federation_reference_id: string | null;
  recent_poule_id: number | null;
}

interface CompetitionSummary {
  id: number;
  name: string;
  short_name: string | null;
  next_match_date: ISODateTime | null;
  gender: "men" | "women" | string | null;
  amount_live_games: number;
  poule_id: number | null;
  logo: string | null;
  class_name?: string | null;
  sort?: number | null;
}

interface ClubSummary {
  federation_reference_id: string;
  name: string;
  friendly_name: string;
  city: string;
  logo: string | null;
  type: "regular" | "business" | string;
}
```

### 9.2 Club detail

```ts
interface ClubDetail extends ClubSummary {
  address: string | null;
  zipcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tenue: string | null;
  district: string | null;
  payment_options: string | null;
  parking: string | null;
  hockey_types: string[];
  teams: TeamSummary[];
  announcement: string | null;
}
```

The verified club response included public contact details. Republish only what an application actually needs.

### 9.3 Poules and standings

```ts
interface CompetitionContext {
  id: number;
  name: string;
  short_name: string | null;
  period_name?: string | null;
  class_name?: string | null;
  poule_name?: string | null;
  national_competition_id?: number | null;
  national_competition_name?: string | null;
  district_id?: number | null;
  district_name?: string | null;
}

interface Standing {
  change: "up" | "down" | "equal" | "none" | string;
  rank_change: number;
  rank_date_previous: string | null;
  rank_date_current: string | null;
  rank: number;
  played: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  penalties: number;
  poule_name: string | null;
  poule_id: number;
  team: TeamSummary;
}

interface Poule {
  id: number;
  name: string;
  competition: CompetitionContext | CompetitionSummary;
  standings: Standing[];
  matches: MatchSummary[];
}

interface TeamPouleResponse {
  team: TeamSummary & {
    poules: Array<{
      id: number;
      name: string;
      competition: CompetitionContext;
    }>;
  };
  poule: Poule;
}
```

National competition detail has this broad shape:

```ts
interface NationalCompetitionDetail extends CompetitionSummary {
  poules: Poule[];
}
```

International competition detail usually puts `standings` and `matches` directly on the competition rather than inside `poules`:

```ts
interface InternationalCompetitionDetail extends CompetitionSummary {
  standings: Standing[];
  matches: MatchSummary[];
}
```

### 9.4 Match records

```ts
type MatchStatus =
  | "discontinued"
  | "cancelled"
  | "final"
  | "result"
  | "announced"
  | "live"
  | "scheduled"
  | "expired"
  | "unknown";

interface MatchLocation {
  facility?: {
    name: string | null;
    address?: string | null;
  } | null;
  field?: {
    name: string | null;
    type: string | null;
  } | null;
  announcement?: string | null;
}

interface MatchSummary {
  id: number;
  date: ISODateTime;
  status: MatchStatus | string;
  cancellation_minute: number | null;
  home: TeamSummary;
  away: TeamSummary;
  own_team_id: number | null;
  shootouts: { home: number; away: number };
  score: { home: number; away: number };
  location?: MatchLocation | null;
  poule_name: string | null;
  poule_id: number | null;
  remarks: string | null;
  competition_name: string | null;
  gender: "men" | "women" | string | null;
  role: string;
  role_name: string | null;
  announcement?: string | null;
  round: number | null;
  user_action_required?: boolean;
  user_action_description?: string | null;
}

interface MatchDetail extends MatchSummary {
  actions: MatchAction[];
  videos?: unknown[];
  approved_by_home_team?: boolean;
  approved_by_away_team?: boolean;
}
```

Behavioral notes:

- Scheduled and announced matches commonly carry `0-0`; that is not a played score.
- `announced` facility matches can have a timestamp at `00:00`. Treat that as “date announced, time TBD” unless another source confirms midnight.
- `location` varies considerably. International records may contain only `facility.name`.
- National location addresses can be a single string containing a newline.
- Anonymous records used `role: "none"` and `role_name: null`.
- No explicit public umpire or official identity field was observed. `role` appears to describe the current viewer's relationship to a match, not the appointed officials.
- National detail records exposed team approval booleans; international records did not in the samples.

### 9.5 Match actions

```ts
type MatchActionCategory = "goal" | "card" | "match" | "penalty" | "shootout";
type MatchSide = "home" | "away" | "both";

interface MatchAction {
  id: number;
  match_id: number;
  action: MatchActionCategory | string;
  action_type: string;
  side: MatchSide | string;
  action_at: ISODateTime;
  seconds_since_start: number | null;
  team_id: number | null;
  person_name?: string | null;
  reason?: string | null;
  duration_in_seconds?: number | null;
}
```

Action types defined by the current client:

| Category        | Action types                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Card            | `card-yellow`, `card-green`, `card-red`                                                                                                |
| Goal            | `goal`, `goal-pc`, `goal-ps`, `goal-c`                                                                                                 |
| Shootout        | `shootout` plus results `goal`, `miss`, `ps`, `ps-miss`, `restart` in shootout context                                                 |
| Match lifecycle | `start`, `end`, `start-period`, `end-period`, `start-shootout`, `end-shootout`, `pause`, `resume`, `submit`, `time-travel`, `canceled` |

Be careful with spelling: match status uses `cancelled` with two `l` characters, while the action type uses `canceled` with one.

Actions can expose player names. Treat those as personal data and avoid unnecessary long-term storage or republication, especially for youth matches.

### 9.6 Facilities

```ts
interface Address {
  id: number;
  country_code: string;
  city: string;
  postal_code: string;
  street_address: string;
  lat: string | null;
  lon: string | null;
}

interface Facility {
  id: number;
  name: string;
  address: Address;
}

interface FacilityMatches extends Facility {
  matches: MatchSummary[];
}
```

Latitude and longitude were strings in the verified response. Parse them explicitly before geographic calculations.

Facility-scoped matches can omit `location` because the containing facility already supplies that context.

### 9.7 Favourites

```ts
interface Favorite {
  id: number;
  is_live: boolean;
  international: boolean;
  team: TeamSummary | null;
  competition: CompetitionSummary | null;
  club: ClubSummary | null;
}
```

Some curated default favourite records had all three target fields set to `null`. Consumers must tolerate incomplete records.

## 10. Public Match Center fragment routes

These are browser routes below `https://www.hockey.nl/match-center#` rather than API routes.

| Fragment path                                       | Meaning                        |
| --------------------------------------------------- | ------------------------------ |
| `/`                                                 | Default curated matches        |
| `/my-matches`                                       | User/default match area        |
| `/my-matches/standings`                             | Standings tab                  |
| `/my-matches/program`                               | Programme tab                  |
| `/my-matches/results`                               | Results tab                    |
| `/clubs`                                            | Club list                      |
| `/club/{clubId}`                                    | Club page                      |
| `/club/{clubId}/field-teams`                        | Field teams                    |
| `/club/{clubId}/indoor-teams`                       | Indoor teams                   |
| `/club/{clubId}/business-teams`                     | Business teams                 |
| `/club/{clubId}/info`                               | Club information               |
| `/competitions/{competitionId}`                     | National competition           |
| `/competitions/{competitionId}/standings`           | Standings                      |
| `/competitions/{competitionId}/program`             | Programme                      |
| `/competitions/{competitionId}/results`             | Results                        |
| `/team/{teamId}\|{pouleId}`                         | Team in selected poule         |
| `/team/{teamId}\|{pouleId}/standings`               | Team/poule standings           |
| `/team/{teamId}\|{pouleId}/program`                 | Team/poule programme           |
| `/team/{teamId}\|{pouleId}/results`                 | Team/poule results             |
| `/match/{matchId}`                                  | National match                 |
| `/match/international/{matchId}`                    | International match            |
| `/location/{facilityId}`                            | Facility                       |
| `/location/{facilityId}/info`                       | Facility information           |
| `/location/{facilityId}/program`                    | Facility programme             |
| `/location/{facilityId}/results`                    | Facility results               |
| `/international/{teamId}/{competitionId}`           | International team/competition |
| `/international/{teamId}/{competitionId}/standings` | International standings        |
| `/international/{teamId}/{competitionId}/program`   | International programme        |
| `/international/{teamId}/{competitionId}/results`   | International results          |
| `/search/clubs`                                     | Club search tab                |
| `/search/companies`                                 | Business-club search tab       |
| `/search/competition`                               | Competition search tab         |
| `/search/locations`                                 | Facility search tab            |

Do not scrape these routes when a structured API endpoint is available. They remain useful as human-facing deep links from calendars or dashboards.

## 11. Reusable web components exposed by the bundle

The public bundle registers these custom elements:

| Element                       | Main attributes                                             | API used                                         |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `<match-center>`              | `theme`                                                     | Full router/application                          |
| `<international-competition>` | `competition-id`, `start-date`, `end-date`, `tabs`, `theme` | `/competitions/international/{id}`               |
| `<poule-widget>`              | `poule-id`, `start-date`, `end-date`, `tabs`, `theme`       | `/poules/{id}`                                   |
| `<match-widget>`              | `match-id`, `international`, `collapsed`, `theme`           | `/matches/{id}` or `/matches/international/{id}` |
| `<upcoming-matches>`          | `theme`, `base-url`                                         | `/favorites/defaults/matches`                    |

The supported theme values in the current code are effectively `hockey` and `knhb`, selecting `hockey.css` or `knhb.css`.

These elements remain subject to the same CORS and undocumented-API constraints. Reusing them outside an allowed origin may not work.

## 12. Dates, times, and calendar semantics

All observed match timestamps were RFC 3339/ISO 8601 strings with an explicit offset. Examples included:

```text
2026-09-27T12:45:00+02:00
2026-08-16T14:00:00+00:00
```

Adapter rules:

- Parse timestamps as instants; never remove the offset before parsing.
- Render Dutch domestic fixtures in `Europe/Amsterdam` unless the product has a stronger venue-timezone source.
- Do not assume every `+00:00` competition timestamp is intended for UTC display; the web application parses it with JavaScript `Date` and formats it in the browser's local timezone.
- Treat `status === "announced"` plus local time `00:00` as time TBD.
- Use match ID as the stable external identity for calendar entries, for example `hockeynl-match-2079156@your-domain`.
- Update an existing calendar event when time, status, field, venue, or remarks change.
- Do not create a new event solely because a poule ID changed if the match ID remained the same.
- Map `cancelled` and `discontinued` to a cancelled calendar status; handle `expired` and `unknown` conservatively.

## 13. CORS and deployment implications

A verified preflight from `Origin: https://www.hockey.nl` returned:

```text
Access-Control-Allow-Origin: https://www.hockey.nl
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: x-hapi-authorization,
  x-hapi-timestamp,
  x-hapi-signature,
  x-hapi-version,
  x-requested-with,
  content-type
```

The same preflight from `https://example.com` did not receive `Access-Control-Allow-Origin`.

Consequences:

- A static browser-only app on an arbitrary domain is not a reliable architecture.
- Use a backend or serverless adapter and expose only the normalized fields the frontend needs.
- Do not create a permissive public proxy to the upstream API.
- Protect any adapter endpoint against abuse and cache upstream responses.

## 14. Recommended adapter architecture

```text
Scheduled poller or request-driven backend
  ├─ anonymous device credential store
  ├─ signed HockeyWeerelt API client
  ├─ response validator
  ├─ normalized domain model
  ├─ cache / change detector
  └─ outputs
       ├─ JSON for TRMNL
       ├─ ICS calendar feed
       ├─ family dashboard
       └─ notifications
```

Recommended separation:

1. **Transport layer**: registration, signing, retry-once behavior, timeouts, and HTTP errors.
2. **Discovery layer**: club lookup, team lookup, and current-poule resolution.
3. **Normalization layer**: turn endpoint-specific match variants into one internal fixture type.
4. **Product layer**: TRMNL rendering, ICS generation, reminders, or statistics.

A useful normalized fixture model:

```ts
interface NormalizedFixture {
  source: "hockey-nl-match-center";
  matchId: number;
  sourceUrl: string;
  start: string;
  timeConfirmed: boolean;
  status: string;
  home: { id: number; name: string; clubId: string | null };
  away: { id: number; name: string; clubId: string | null };
  score: { home: number; away: number } | null;
  shootouts: { home: number; away: number } | null;
  competition: string | null;
  pouleId: number | null;
  round: number | null;
  venue: {
    facilityId: number | null;
    name: string | null;
    field: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  remarks: string | null;
  fetchedAt: string;
}
```

## 15. Discovery workflow for a family team

For a new team integration:

1. Fetch `/clubs` and find the club by `friendly_name` or federation reference.
2. Fetch `/clubs/{federationReferenceId}`.
3. Find the exact team by `name`, `short_name`, category, and `hockey_type`.
4. Read `team.id` and `team.recent_poule_id`.
5. Fetch `/poules/{recentPouleId}/teams/{teamId}`.
6. Check `team.poules`; allow configuration to select another poule for cup or historical matches.
7. Read `poule.matches` and filter to matches where `home.id` or `away.id` equals the team ID.
8. Fetch `/matches/{matchId}` only when actions or full detail are needed.
9. Refresh club/team discovery at season boundaries because poule IDs change.

Avoid matching only on a human-readable team label. Labels can change, and duplicate-looking names can occur.

## 16. Caching and polling

No documented rate limit or cache contract was observed. Use conservative defaults:

- Club list: cache for 24 hours or longer.
- Facility list: cache for 24 hours or longer.
- Club detail and team discovery: cache for 6–24 hours; refresh more often near season transitions.
- Future programme: cache for 15–60 minutes.
- Same-day scheduled matches: cache for 5–15 minutes.
- Live match detail: poll no faster than every 30–60 seconds unless a supported policy is discovered.
- Final matches: stop frequent polling after score/actions remain stable.
- Back off exponentially after errors.
- Add random jitter to scheduled jobs.

Do not repeatedly download whole competition objects when a targeted poule endpoint is sufficient. A single verified national competition response was roughly 0.6 MB.

## 17. Validation and defensive parsing

Adapters should expect:

- Missing properties and explicit `null` values
- New enum values
- Different nesting for national and international competition data
- Empty favourite target fields
- String coordinates
- Location objects without addresses or fields
- Match list records that are less detailed than match-detail records
- Placeholder zero scores on unplayed matches
- Placeholder midnight times for announced matches
- Inconsistent effectiveness of server-side date filters
- Seasonal changes to IDs and labels

Recommended checks:

- Validate every payload with a permissive schema library such as Zod, Valibot, or JSON Schema.
- Preserve unknown fields when storing raw diagnostic fixtures, but do not expose them automatically.
- Log schema drift without logging device tokens, bearer tokens, full contact information, or unnecessary player data.
- Keep small redacted response fixtures for contract tests.
- Test the signature algorithm with bracketed date-filter query parameters.

## 18. Privacy, access, and responsible use

This is an internal web-application API, not an announced public developer platform.

Before deploying anything beyond personal/family use:

- Review the current Hockey.nl/KNHB terms and privacy information.
- Ask for permission or an official integration route when appropriate.
- Use low request volumes and caching.
- Do not attempt to bypass login or authorization.
- Do not scrape or redistribute account-only data.
- Minimize storage of club contact details and player names.
- Be especially careful with youth-team information.
- Do not expose the device token, UUID, or signing service through a public unrestricted proxy.

The SHA-1 signature is an access protocol, not a confidentiality mechanism. Use HTTPS, protect stored credentials, and never log signature inputs together with reusable credentials.

## 19. Known unknowns

The following areas remain unverified or intentionally untested:

- Token lifetime and server-side device-registration retention
- Explicit rate limits
- Official support or stability guarantees
- Full signed-in OIDC flow
- Behaviour of favourite write/delete operations
- Whether account data can expose umpire appointments
- Complete action payload variants for penalties and shootouts
- Every possible status, role, and competition variant in historical data
- Cache headers and conditional request support across all endpoints
- Whether date filters are supported consistently for national competition detail

Do not infer a capability merely because a related field exists. In particular, `role` and `role_name` do not establish that appointed umpires are publicly retrievable.

## 20. Change-detection checklist

Because the API is unofficial, an adapter should monitor the upstream contract:

1. Fetch `https://mc.static-hw.nl/v2/match-center.js` periodically.
2. Detect a changed main-bundle filename.
3. Run a small, read-only smoke suite:
   - device registration
   - `/clubs`
   - one configured club
   - one configured poule/team
   - one known match
4. Verify required response fields and enum handling.
5. Alert on signature failures, new `401`/`403` behavior, or schema drift.
6. Keep the last working adapter version and cached output available during upstream outages.

## 21. Quick-reference examples

Verified example identifiers from the 2026-08-15 snapshot:

```text
Club:          HH11PD0       SCHC
Team:          774           SCHC D1
Poule:         180863        Staatsloterij Hoofdklasse Dames, Poule A
Team route:    774|180863
Match:         2079156       SCHC D1 – HGC D1
Facility:      281           Sportpark Kees Boekelaan (SCHC)
International: team 2, competition 47
```

Representative calls:

```text
GET /clubs/HH11PD0
GET /poules/180863/teams/774
GET /poules/180863?filter[dateStart]=2026-09-27&filter[dateEnd]=2026-10-05
GET /matches/2079156
GET /facilities/281/matches?filter[dateStart]=2026-09-27&filter[dateEnd]=2026-09-28
GET /competitions/international/47/team/2
```

Human-facing links:

```text
https://www.hockey.nl/match-center#/club/HH11PD0
https://www.hockey.nl/match-center#/team/774|180863
https://www.hockey.nl/match-center#/match/2079156
https://www.hockey.nl/match-center#/location/281
https://www.hockey.nl/match-center#/international/2/47
```

## 22. Upstream references

- Match Center: `https://www.hockey.nl/match-center`
- Stable JavaScript loader: `https://mc.static-hw.nl/v2/match-center.js`
- Styles and component assets: `https://mc.static-hw.nl/v2/`
- API origin: `https://app.hockeyweerelt.nl`

The stable loader is the best starting point for future reverse-engineering because it points to the current hashed application bundle.
