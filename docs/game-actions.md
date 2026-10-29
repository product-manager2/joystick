# Pilot game API contract

`GET /api/v1/game` returns the authenticated user's game snapshot. `POST /api/v1/game/actions` accepts `{action,entityId?,payload?,requestId}` and returns `{revision,snapshot}`. `requestId` is a UUID. Reusing it with the same action returns the current snapshot without repeating the write; using it with different contents returns `idempotency_conflict`. The server gets the actor from the cookie and never accepts client totals or reviews as authority.

All POSTs require the configured `Origin`. The client must escape snapshot text before HTML insertion.

| Action | Entity ID | Payload |
| --- | --- | --- |
| `profile.update` | — | `agentName?`, `roles?`, `skills?`, `preferences?` (skills self declared) |
| `mission.create` | — | `title`, `pitch?`, `tag?`, `team?`, `roles?`, `bounty?`, `rules?`, `stages:[{name,goal?,target?,unit?,tracks?}]` |
| `mission.update` | mission | `title?`, `pitch?`, `tag?`, `team?`, `roles?`, `bounty?` (owner) |
| `mission.join`, `mission.leave`, `mission.voice` | mission | — |
| `stage.create` | mission | `name`, `goal?`, `target?`, `unit?`, `tracks?` (owner) |
| `stage.approve` | stage | — (owner; all tasks reviewed and gate target met) |
| `stage.advance` | mission | — (owner; previous stage approved) |
| `plan.create` | stage | `name`, `squad`, `bet?` |
| `plan.update` | plan | `name?`, `squad?`, `bet?` (creator or owner) |
| `plan.join` | plan | — |
| `plan.back` | plan | `testCredits?` (0 for free backing; reserves credits atomically when positive) |
| `plan.approve` | plan | — (owner) |
| `merge.propose` | source plan | `targetPlanId`, `reason?` |
| `merge.decide`, `merge.dismiss` | merge proposal | — (owner) |
| `quest.create` | stage | `title`, `description?`, `role?`, `size?`, `planId?`, `parentId?`, `dependencies?`, `rewardCredits?` |
| `quest.update` | quest | `title?`, `description?`, `planId?`, `parentId?`, `dependencies?`, `rewardCredits?` (owner, open task) |
| `quest.claim`, `quest.release`, `quest.watch` | quest | — |
| `quest.assign` | quest | `userId` (owner) |
| `quest.decide` | quest | `choice`, `reason?` (claimant) |
| `quest.submit` | quest | `title`, `content` (claimant; bounded text artifact) |
| `quest.review` | quest | `verdict:'approve'|'changes_requested'`, `note?` (mission member other than claimant) |
| `quest.nudge` | quest | `message` |
| `pair.request` | quest | `userId` |
| `need.create` | mission | `title`, `detail?` |
| `need.support` | need | — |
| `pledge.create` | mission | `kind:'time'|'compute'|'test_credits'`, `amount`, `note?` |
| `invite.create` | mission | `email` of a registered user |
| `invite.accept`, `invite.decline` | invite | — |
| `notification.read` | notification | — |
| `funding.reserve` | mission | `amount` in test credits |
| `payout.simulate` | approved quest | — (records simulation, moves no credits) |
| `spend.flag` | mission | `reason` |
| `tool.preference` | — | `key`, `enabled` |
| `skill.assert` | — | `skill` (self declared) |
| `room.create` | — | `{kind:'dm',userId}` or `{kind:'mission'|'stage'|'plan'|'quest',scopeId}` |

Positive `rewardCredits` requires the mission owner and enough unallocated reserved test credits. Credits are reserved by `funding.reserve` or `plan.back`; plan-backed credits can fund only that plan's tasks. XP comes from task size on the server. Two distinct registered mission members must approve the same artifact version. A changes request requires a new artifact version. Stage closure is an owner-attested pilot decision after reviewed tasks meet the stage gate.

`GET /api/v1/game/artifacts/:artifactId` downloads an artifact only for a current mission member. `GET /api/v1/game/credits.csv` exports only the current user's test-credit journal. Shared room reads, writes and WebSocket delivery check current membership; DM rooms check their actual room members. Workbook people, invites, prizes and outcomes live only in labeled `mission.sample` examples, separate from real accounts and ledger entries.
