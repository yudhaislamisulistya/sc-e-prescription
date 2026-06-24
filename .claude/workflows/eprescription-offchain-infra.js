export const meta = {
  name: 'eprescription-offchain-infra',
  description: 'Implement + adversarially review off-chain libs, Besu/Docker infra, indexer, KMS, Pages-Router API, and evaluation harness',
  phases: [
    { title: 'T9 ipfs-encrypted' },
    { title: 'T10 besu infra' },
    { title: 'T11 indexer' },
    { title: 'T12 kms-signer' },
    { title: 'T13 api prepare/submit' },
    { title: 'T14 api grant/read' },
    { title: 'T15 evaluation' },
  ],
}

const PLAN = 'docs/superpowers/plans/2026-06-19-eprescription-redesign.md'
const CORR = 'docs/superpowers/plans/2026-06-19-execution-corrections.md'
const TRAILER = 'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>'

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'] },
    commitHash: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testCommand: { type: 'string' },
    testSummary: { type: 'string' },
    concerns: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['status', 'commitHash', 'filesChanged', 'testCommand', 'testSummary'],
}
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    specCompliant: { type: 'boolean' }, qualityApproved: { type: 'boolean' },
    critical: { type: 'array', items: { type: 'string' } },
    important: { type: 'array', items: { type: 'string' } },
    minor: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['specCompliant', 'qualityApproved', 'critical', 'important', 'minor', 'summary'],
}

const ENV_NOTE = 'ENVIRONMENT: Docker daemon, Postgres, IPFS, Besu, solc, and slither are NOT available in this workspace. Do not try to run them. Verification is structural/type-level only as specified by the verify command. Be honest in your report about what is scaffolding (not runtime-verified) vs actually executed.'

const TASKS = [
  {
    n: 9, key: 'ipfs', phase: 'T9 ipfs-encrypted',
    title: 'Encrypted IPFS client (AES-256-GCM envelope + payloadHash integrity)',
    files: 'lib/ipfs-encrypted.ts',
    verify: 'npx tsc --noEmit',
    notes: 'Create lib/ipfs-encrypted.ts per plan Task 9 with these fixes: (1) REMOVE the unused `helia` / `@helia/unixfs` imports — they are NOT installed and NOT used; the module talks to the Kubo HTTP API via the global `fetch`/`FormData`/`Blob` (Node 22). (2) Env-driven endpoints per corrections C8: IPFS_API_URL (default http://localhost:5001) for /api/v0/add and /api/v0/pin/rm; IPFS_GATEWAY_URL (default http://localhost:8080) for /ipfs/<cid>. (3) Functions: encryptAndUpload(plaintext: Buffer, cek: Buffer) => Promise<{cid: string; payloadHash: `0x${string}`; encryptedPackage}>; fetchAndDecrypt(cid, payloadHash, cek) => Promise<Buffer> that recomputes keccak256(packageBytes) and THROWS on mismatch BEFORE decrypting; unpinCID(cid). Import the AES/package helpers from "./crypto" and keccak256 from "viem". Do NOT modify the existing lib/ipfs.ts. Only encrypted package bytes are ever uploaded — never plaintext.',
    reviewFocus: 'Endpoints env-driven (no hardcoded remote node); payloadHash = keccak256(package bytes) recomputed and enforced BEFORE decrypt; only the encrypted package is uploaded (plaintext never leaves the process); no imports of uninstalled packages; non-200 responses throw.',
    attacks: 'payloadHash mismatch must throw (tamper detection); any path where plaintext could be uploaded; missing await; swallowed fetch errors; reuse of the existing remote IPFS host hardcoded.',
  },
  {
    n: 10, key: 'besu', phase: 'T10 besu infra',
    title: 'Hyperledger Besu IBFT 2.0 + Docker Compose consortium stack',
    files: 'infra/besu/genesis.json, infra/besu/besu-validator.toml, infra/besu/besu-rpc.toml, infra/besu/generate-keys.sh, docker-compose.yml, secrets/.gitkeep',
    verify: "node -e \"JSON.parse(require('fs').readFileSync('infra/besu/genesis.json','utf8')); console.log('genesis JSON ok')\" && bash -n infra/besu/generate-keys.sh && echo 'shell ok'",
    notes: 'Create the Besu infra per plan Task 10. genesis.json: chainId 1337, IBFT2 {blockperiodseconds 2, epochlength 30000, requesttimeoutseconds 4, blockreward "0x0"}, large gasLimit, difficulty "0x1". The IBFT extraData and the deployer alloc address depend on validator keys generated at deploy time — keep them as documented JSON-valid placeholder STRINGS (e.g. "REPLACE_WITH_IBFT_EXTRA_DATA") so the file still parses as valid JSON, and have generate-keys.sh print/explain how to fill them (besu operator-tool). generate-keys.sh must pass `bash -n`. REPLACE the current minimal docker-compose.yml with the full consortium stack from plan Task 10 (besu-validator, besu-rpc, postgres, redis, ipfs, ipfs-cluster optional, indexer, kms-signer, nextjs-app) with networks/volumes/secrets; ensure min-gas-price / gasPrice 0 (free-gas consortium). Create secrets/.gitkeep ONLY — never write real secret values (secrets/ is gitignored). ' + ENV_NOTE,
    reviewFocus: 'IBFT2 params correct; free-gas (min-gas-price 0); RPC node does not expose ADMIN/DEBUG unnecessarily; only encrypted blobs intended for IPFS; genesis.json is valid JSON with documented placeholders; docker-compose is well-formed YAML referencing the right services; secrets dir holds only .gitkeep (no real secrets committed).',
    attacks: 'Real secret values committed; genesis invalid JSON; min-gas-price not zero; RPC CORS/admin exposure noted; compose YAML indentation errors; placeholders that break JSON parsing.',
  },
  {
    n: 11, key: 'indexer', phase: 'T11 indexer',
    title: 'Postgres read-model schema + event indexer service',
    files: 'services/indexer/schema.sql, services/indexer/index.ts, services/indexer/Dockerfile',
    verify: 'npx tsc --noEmit',
    notes: 'Create per plan Task 11. schema.sql: tables prescription, prescription_event, actor, patient, key_access, indexer_cursor (+ indexes, + seed cursor row) per the plan / spec §10.4. index.ts: a viem getLogs poller that indexes PrescriptionIssued/PrescriptionDispensed/PrescriptionRevoked/PrescriptionExpired, upserts into Postgres via the `pg` Pool using PARAMETERIZED queries ($1,$2,...), and advances indexer_cursor; chunk the block range (~100). CRITICAL: open contracts/PrescriptionRegistry.sol and copy the EXACT event signatures into the parseAbiItem strings (names, indexed-ness, and types — e.g. PrescriptionDispensed emits `State newState` which is uint8 in the ABI). A signature mismatch silently indexes nothing. Dockerfile: node:20-alpine. ' + ENV_NOTE + ' Verify is `npx tsc --noEmit` exit 0 (schema.sql is reviewed structurally, not executed).',
    reviewFocus: 'All SQL uses parameterized queries (no string interpolation => no injection); event ABIs EXACTLY match contracts/PrescriptionRegistry.sol; idempotent upserts (ON CONFLICT) so re-orgs/replays do not crash; cursor advances correctly; schema matches spec tables/types/PKs.',
    attacks: 'SQL injection via interpolation; event signature mismatch vs the actual contract (verify each against PrescriptionRegistry.sol); cursor off-by-one / stuck; missing ON CONFLICT; integer/bytea encoding bugs for bytes32 ids.',
  },
  {
    n: 12, key: 'kms', phase: 'T12 kms-signer',
    title: 'KMS signer microservice (patient custodian CEK re-wrap)',
    files: 'services/kms-signer/index.ts, services/kms-signer/Dockerfile',
    verify: 'npx tsc --noEmit',
    notes: 'Create per plan Task 12. A minimal node "http" server exposing POST /grant-access that: unwraps the CEK using the patient private key (via a getPatientPrivKey abstraction that in production is an AWS KMS / HashiCorp Vault NON-EXTRACTABLE key op — add a clear comment; a process.env fallback is DEV ONLY), re-wraps the CEK to the pharmacy public key with wrapCEK from "../../lib/crypto", and submits the grantAccess(prescriptionId, recipientBytes32, wrappedKey) tx via a viem walletClient signed by the KMS_SERVICE_KEY (the PATIENT_CUSTODIAN_ROLE service EOA). Import helpers from "../../lib/crypto". Dockerfile node:20-alpine. ' + ENV_NOTE + ' Verify `npx tsc --noEmit` exit 0; do not run it.',
    reviewFocus: 'PATIENT_CUSTODIAN_ROLE service EOA (KMS_SERVICE_KEY) — no shared hot wallet; CEK re-wrap (unwrap with patient key, wrap to pharmacy pubkey) correct; viem writeContract args order; recipient encoded as bytes32; explicit production-key (non-extractable HSM/KMS) warning comment present.',
    attacks: 'Private key logged or returned in a response; the /grant-access endpoint lacks auth (note it must be network-internal only); wrong recipient encoding; CEK leaked in errors; dev env fallback not clearly gated.',
  },
  {
    n: 13, key: 'api-issue', phase: 'T13 api prepare/submit',
    title: 'Pages-Router API: prescription prepare + submit',
    files: 'src/pages/api/prescriptions/prepare.ts, src/pages/api/prescriptions/submit.ts',
    verify: 'npx tsc --noEmit',
    notes: 'Pages Router per corrections C4. FIRST read src/pages/api/createPrescription.ts to match the existing idiom exactly: `import type { NextApiRequest, NextApiResponse } from "next"`, `export default async function handler(req, res)`, method guard returning 405, req.body for input, res.status().json(). Import root-level libs via RELATIVE paths from this subfolder: `../../../../lib/crypto` and `../../../../lib/ipfs-encrypted` (do NOT use `@/lib/...` — the `@/*` alias maps to src/, and root lib/ has NO alias). prepare.ts: build prescriptionId = keccak256(encodePacked(["address","bytes32","uint64","bytes8"],[doctor,patientRef,issuedAt,nonce])) and return the canonical payload + EIP-712 typed data. submit.ts: AES-256-GCM encrypt the signed canonical payload (generateCEK + encryptAndUpload), read the patient encryption pubkey from IdentityRegistry via a viem publicClient (env IDENTITY_REGISTRY_ADDRESS + RPC_URL), wrap the CEK for the patient, and return {cid, payloadHash, wrappedForPatient}. Never return PII. ' + ENV_NOTE + ' Verify `npx tsc --noEmit` exit 0.',
    reviewFocus: 'Pages Router signature + 405 guards; relative lib imports that actually resolve (no broken `@/lib`); input validation (400 on missing fields); payloadHash sourced from the encrypted package; no PII echoed back; keccak256 encoding mirrors the Solidity prescriptionId derivation.',
    attacks: 'Missing field validation; an alias import that will not resolve at build; PII leakage in responses; unhandled rejections; keccak encodePacked types not matching Solidity.',
  },
  {
    n: 14, key: 'api-access', phase: 'T14 api grant/read',
    title: 'Pages-Router API: key-access grant + prescription read',
    files: 'src/pages/api/key-access/grant.ts, src/pages/api/prescriptions/[id].ts',
    verify: 'npx tsc --noEmit',
    notes: 'Pages Router (match src/pages/api/createPrescription.ts idiom). grant.ts: POST, validates prescriptionId + pharmacyAddr, then forwards to the KMS signer microservice (env KMS_SIGNER_URL, default http://localhost:4000) which performs the patient->pharmacy CEK re-wrap and the on-chain grantAccess. The web tier must NOT handle patient private keys. [id].ts: GET dynamic route, read prescriptionId from req.query.id, query the Postgres read-model via a `pg` Pool (env DATABASE_URL) with a PARAMETERIZED query, return the projection or 404. ' + ENV_NOTE + ' Verify `npx tsc --noEmit` exit 0.',
    reviewFocus: '[id].ts uses req.query.id with a parameterized SQL query (no injection); method guards (POST vs GET); grant.ts delegates all key/custody ops to the KMS service (no patient key in web tier); 404 on missing; no wrapped-key or PII leakage in the read response.',
    attacks: 'SQL injection via req.query.id; missing method guard; leaking wrapped keys / PII; unvalidated inputs; patient key handling sneaking into the web tier.',
  },
  {
    n: 15, key: 'eval', phase: 'T15 evaluation',
    title: 'Gas benchmark (real) + Slither setup (best-effort)',
    files: 'evaluation/gas-benchmark.ts, evaluation/slither.sh',
    verify: 'npx hardhat run evaluation/gas-benchmark.ts --network hardhat && bash -n evaluation/slither.sh && echo shell-ok',
    notes: 'gas-benchmark.ts: deploy IdentityRegistry + PrescriptionRegistry on the in-process hardhat network, register a doctor and a pharmacist, then measure the REAL gasUsed of each operation by fetching its OWN transaction receipt via publicClient.getTransactionReceipt({hash}). FIX the plan bug where registerActor printed issueReceipt.gasUsed — every printed number must come from that operation\'s own receipt (registerActor, issuePrescription, dispense, revoke). Print a clean labeled table. It MUST actually execute and print real gas numbers (this is the runtime verification). slither.sh: best-effort — attempt `slither` on the three contracts with the OZ remapping, but GUARD so that a missing slither/solc/pip does NOT hard-fail: detect absence, print "slither not installed — skipping (install: pip3 install slither-analyzer)", and exit 0. `chmod +x evaluation/slither.sh`. ' + ENV_NOTE + ' Verify runs gas-benchmark for real and `bash -n` on slither.sh; also keep `npx tsc --noEmit` green.',
    reviewFocus: 'Each gas figure comes from that operation\'s OWN receipt (the plan\'s copy-paste bug is fixed); the benchmark genuinely deploys + executes (not stubbed); slither.sh is non-fatal when slither is absent and returns exit 0; this addresses V7 (evaluation methodology).',
    attacks: 'Receipt copy-paste bug (wrong gas attribution); benchmark that does not actually run the ops; slither.sh that hard-fails the pipeline when slither/solc is missing; misreported numbers.',
  },
]

function implementerPrompt(t) {
  return `You are implementing ONE task of an e-prescription smart-contract redesign. Branch feat/eprescription-redesign-impl is checked out. The on-chain core is DONE and committed: contracts (IdentityRegistry, PrescriptionRegistry, KeyAccessRegistry, interfaces), lib/crypto/* (AES-256-GCM, ECIES, EIP-712, patientRef), ignition Deploy module — 58 tests passing, \`npx hardhat compile\` and \`npx tsc --noEmit\` both currently green.

STEP 0 — Read in full before coding:
  1. ${CORR}  — CONTROLLER CORRECTIONS (override the plan).
  2. The "### Task ${t.n}:" section in ${PLAN}.
  3. Any source files named in your overrides (e.g. existing API routes, contracts).

YOUR TASK: Task ${t.n} — ${t.title}
Files to create/modify: ${t.files}

TASK-SPECIFIC OVERRIDES (obey over the plan):
${t.notes}

METHOD:
  1. Create the file(s) per the overrides + plan.
  2. Run the verify command and make it pass: ${t.verify}
  3. Iterate on REAL errors until the verify step is green. Do not stub or fake to pass.

RULES:
- Do NOT modify other tasks' files unless the overrides say so (Task 10 intentionally rewrites docker-compose.yml). Do NOT install new dependencies. Do NOT edit hardhat.config.ts or existing contracts/lib.
- When verify is green, make EXACTLY ONE git commit (add only your files). Last commit-message line EXACTLY:
    ${TRAILER}
- If verify cannot pass after genuine effort, status=BLOCKED with the exact error.

Final output = the structured report only (data for the controller). commitHash = \`git rev-parse --short HEAD\` after committing. testSummary = the concrete result (e.g. "tsc clean", "genesis JSON ok / shell ok", or the gas table header).`
}

function specReviewerPrompt(t, impl) {
  return `You are an ADVERSARIAL SPEC-COMPLIANCE reviewer for Task ${t.n} (${t.title}). READ-ONLY: do NOT edit files; do NOT run builds/tests (the controller re-verifies separately).

Read: ${CORR}; the "### Task ${t.n}:" section in ${PLAN}; and \`git show ${impl.commitHash}\` plus the changed files in their current state.

Implementer reported: status=${impl.status}, verify="${impl.testCommand}", result="${impl.testSummary}", files=${JSON.stringify(impl.filesChanged)}.

Review skeptically for THIS task:
${t.reviewFocus}

Remember the environment: Docker/Postgres/IPFS/Besu/slither are NOT available here, so infra tasks are validated structurally, not at runtime — judge them on structural/spec correctness, not on "did it run". Check that the implementer did not fake runtime verification, and that scaffolding is clearly correct against the spec.

Return the structured verdict: requirement-breaking => critical; real defect => important; nit => minor. Empty arrays if clean. Do not invent issues.`
}

function secReviewerPrompt(t, impl) {
  return `You are an ADVERSARIAL SECURITY / CORRECTNESS reviewer for Task ${t.n} (${t.title}). READ-ONLY: do NOT edit; do NOT run builds. Try to BREAK this implementation on paper.

Read the current task files, \`git show ${impl.commitHash}\`, and ${CORR}.

Attack checklist for THIS task:
${t.attacks}

Also: secrets/keys leaked or committed; injection (SQL/command); missing input validation; PII exposure; broken integrity checks (payloadHash); incorrect cross-component encoding (bytes32 recipient, keccak encodePacked vs Solidity, event ABI vs contract). The environment lacks Docker/Postgres/IPFS/slither — reason about correctness, do not run anything.

Return the structured verdict: genuinely exploitable/incorrect => critical; risky weakness => important; nit => minor. Be concrete (name the file, function, and triggering input). Empty arrays if you cannot break it.`
}

function fixPrompt(t, impl, blocking) {
  return `You are FIXING Task ${t.n} (${t.title}). Branch feat/eprescription-redesign-impl.

Read: ${CORR}; the "### Task ${t.n}:" plan section; the current files; \`git show ${impl.commitHash}\`.

FINDINGS TO FIX (Critical + Important):
${blocking.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}

Fix ALL properly. Re-run verify (${t.verify}) and confirm green without faking. Make ONE new commit; last line exactly:
    ${TRAILER}
Output the structured report: status, commitHash (\`git rev-parse --short HEAD\`), testCommand, testSummary, notes describing each fix.`
}

function reReviewPrompt(t, impl, blocking) {
  return `Re-review Task ${t.n} (${t.title}) after a fix. READ-ONLY; do not run builds.

Read ${CORR}, the current files, and \`git show ${impl.commitHash}\` (the fix commit).

These were to be fixed:
${blocking.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}

Confirm each is genuinely resolved and no new spec/security defect was introduced (re-skim: ${t.reviewFocus}). Return the verdict — still-open or newly-introduced issues as critical/important; empty arrays if clean.`
}

const results = []
for (const t of TASKS) {
  phase(t.phase)
  log(`Task ${t.n}: ${t.title} — implementing`)

  let impl = await agent(implementerPrompt(t), { label: `impl:T${t.n}`, phase: t.phase, schema: IMPL_SCHEMA })
  if (!impl) { results.push({ task: t.n, outcome: 'IMPLEMENTER_DIED' }); log(`Task ${t.n}: implementer null — stopping`); break }
  if (impl.status === 'BLOCKED' || impl.status === 'NEEDS_CONTEXT') { results.push({ task: t.n, outcome: impl.status, impl }); log(`Task ${t.n}: ${impl.status} — stopping for controller`); break }
  if (!impl.commitHash) { results.push({ task: t.n, outcome: 'NO_COMMIT', impl }); log(`Task ${t.n}: no commit — stopping`); break }

  log(`Task ${t.n}: implemented (${impl.commitHash}, ${impl.testSummary}) — adversarial review`)
  let reviews = (await parallel([
    () => agent(specReviewerPrompt(t, impl), { label: `rev-spec:T${t.n}`, phase: t.phase, schema: REVIEW_SCHEMA }),
    () => agent(secReviewerPrompt(t, impl), { label: `rev-sec:T${t.n}`, phase: t.phase, schema: REVIEW_SCHEMA }),
  ])).filter(Boolean)

  let blocking = reviews.flatMap(r => [...(r.critical || []), ...(r.important || [])])
  const minorAll = reviews.flatMap(r => r.minor || [])

  let round = 0
  while (blocking.length && round < 2) {
    round++
    log(`Task ${t.n}: ${blocking.length} blocking finding(s) — fix round ${round}`)
    const fix = await agent(fixPrompt(t, impl, blocking), { label: `fix:T${t.n}-r${round}`, phase: t.phase, schema: IMPL_SCHEMA })
    if (fix && fix.commitHash) { impl = { ...impl, commitHash: fix.commitHash, testSummary: fix.testSummary, status: fix.status } }
    else { log(`Task ${t.n}: fix round ${round} no commit — leaving open`); break }
    const rr = await agent(reReviewPrompt(t, impl, blocking), { label: `rerev:T${t.n}-r${round}`, phase: t.phase, schema: REVIEW_SCHEMA })
    if (!rr) break
    blocking = [...(rr.critical || []), ...(rr.important || [])]
    if (rr.minor) minorAll.push(...rr.minor)
  }

  results.push({
    task: t.n, title: t.title, finalCommit: impl.commitHash, testSummary: impl.testSummary,
    fixRounds: round, blockingRemaining: blocking, minor: minorAll,
    outcome: blocking.length ? 'DONE_WITH_OPEN_FINDINGS' : 'CLEAN',
  })
  log(`Task ${t.n}: ${blocking.length ? 'DONE with ' + blocking.length + ' open finding(s)' : 'CLEAN'}`)
}

return {
  summary: results.map(r => `T${r.task}: ${r.outcome}${r.finalCommit ? ' @' + r.finalCommit : ''}${r.testSummary ? ' (' + r.testSummary + ')' : ''}${r.fixRounds ? ' [' + r.fixRounds + ' fix round(s)]' : ''}`),
  results,
}
