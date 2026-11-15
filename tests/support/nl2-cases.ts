// NL-2 firewall script cases (task T057; ADR-0001 §3 with Amendments 1, 3 and 5). Shared by
// tests/config/nl2-firewall.test.ts and scripts/assert-required-tests.mjs, which requires every
// title below to pass in CI. Keep it free of runtime imports.

export const OUTBOUND = "172.30.40.0/24";
export const TAG = "accesslens-nl2";

/** Bridge networks the fake `docker` reports, in `docker network ls` order. */
export const BRIDGES: Record<string, string> = {
  accesslens_outbound: OUTBOUND,
  accesslens_public: "172.30.10.0/24",
  "accesslens_scan-ctl": "172.30.20.0/24",
  "accesslens_scan-egress": "172.30.30.0/24",
  bridge: "172.17.0.0/16",
  other_dualstack: "172.18.0.0/16,fd00:1::/64",
};
/** Host addresses the fake `ip -4 -o addr show` reports, in order. */
export const HOST_ADDRS = [
  "127.0.0.1/8",
  "10.0.0.5/24",
  "203.0.113.10/24",
  "172.17.0.1/16",
  "172.30.40.1/24",
];

// Pre-existing rules the scripts must leave alone.
export const DOCKER_USER_BEFORE = ["-N DOCKER-USER", "-A DOCKER-USER -j RETURN"];
export const INPUT_BEFORE = [
  "-P INPUT ACCEPT",
  "-A INPUT -i lo -j ACCEPT",
  "-A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT",
];
export const RAW_BEFORE = {
  PREROUTING: ["-P PREROUTING ACCEPT"],
  OUTPUT: ["-P OUTPUT ACCEPT"],
};
const RAW_HELPER_RULE = "-A PREROUTING -p tcp -m tcp --dport 21 -j CT --helper ftp";
const RAW_NOTRACK_RULE = "-A PREROUTING -s 10.9.9.0/24 -j CT --notrack";

export type Nl2Scenario = {
  networks?: Record<string, string>;
  /** The sysctl's value; null means the sysctl doesn't exist. Default "0". */
  helper?: string | null;
  /** `uname -r`. Default "6.8.0-45-generic" (Ubuntu 24.04). */
  kernel?: string;
  /** Extra raw-table PREROUTING rules. */
  raw?: string[];
  noDockerUser?: boolean;
  noConntrack?: boolean;
  conntrackEmpty?: boolean;
  dockerUser?: string[];
  input?: string[];
};

export type FailClosedCase = { name: string; scenario: Nl2Scenario; message: RegExp };

const withoutOutbound = Object.fromEntries(
  Object.entries(BRIDGES).filter(([k]) => k !== "accesslens_outbound"),
);

/** install-nl2.sh must exit non-zero, naming the problem, and change nothing. */
export const NL2_FAIL_CLOSED_CASES: FailClosedCase[] = [
  {
    name: "Docker's firewall backend isn't iptables (no DOCKER-USER chain)",
    scenario: { noDockerUser: true },
    message: /DOCKER-USER/,
  },
  {
    name: "the outbound subnet differs from docker-compose.yml",
    scenario: { networks: { ...BRIDGES, accesslens_outbound: "172.30.99.0/24" } },
    message: /outbound/i,
  },
  {
    name: "the outbound network doesn't exist",
    scenario: { networks: withoutOutbound },
    message: /outbound/i,
  },
  {
    name: "nf_conntrack_helper is 1",
    scenario: { helper: "1" },
    message: /helper/,
  },
  {
    name: "nf_conntrack_helper is missing on kernel 5.15 (before 6.0)",
    scenario: { helper: null, kernel: "5.15.0-122-generic" },
    message: /helper/,
  },
  {
    name: "nf_conntrack_helper is missing on kernel 5.19 (just before 6.0)",
    scenario: { helper: null, kernel: "5.19.17" },
    message: /helper/,
  },
  {
    name: "nf_conntrack_helper is missing and the kernel version can't be parsed",
    scenario: { helper: null, kernel: "unknown" },
    message: /helper|kernel/,
  },
  {
    name: "a raw-table rule attaches a helper (-j CT --helper) while nf_conntrack_helper is 0",
    scenario: { helper: "0", raw: [RAW_HELPER_RULE] },
    message: /helper/,
  },
  {
    name: "a raw-table rule attaches a helper (-j CT --helper) on kernel 6.8 without the sysctl",
    scenario: { helper: null, kernel: "6.8.0-45-generic", raw: [RAW_HELPER_RULE] },
    message: /helper/,
  },
  {
    name: "conntrack isn't installed",
    scenario: { noConntrack: true },
    message: /\bconntrack\b/,
  },
];

/** install-nl2.sh must accept these: helpers count as off (ADR-0001 Amendment 5). */
export const NL2_HELPERS_OFF_CASES: { name: string; scenario: Nl2Scenario }[] = [
  {
    name: "nf_conntrack_helper is 0 (kernel 5.15)",
    scenario: { helper: "0", kernel: "5.15.0-122-generic" },
  },
  {
    name: "nf_conntrack_helper is missing on kernel 6.0.0",
    scenario: { helper: null, kernel: "6.0.0" },
  },
  {
    name: "nf_conntrack_helper is missing on kernel 6.8 (Ubuntu 24.04)",
    scenario: { helper: null, kernel: "6.8.0-45-generic" },
  },
  {
    name: "nf_conntrack_helper is missing on kernel 6.10",
    scenario: { helper: null, kernel: "6.10.2-arch1-1" },
  },
  {
    name: "the raw table has a CT rule without --helper (-j CT --notrack)",
    scenario: { raw: [RAW_NOTRACK_RULE] },
  },
];

export type Chains = { dockerUser: string[]; input: string[] };
export type VerifyFailCase = {
  name: string;
  /** Turns the correct state into a broken one (inputs are copies). */
  breakIt: (chains: Chains) => Chains;
  message: RegExp;
};

const tagged = (chain: string, dest: string, target = "DROP") =>
  `-A ${chain} -s ${OUTBOUND} -d ${dest} -m comment --comment ${TAG} -j ${target}`;
const swap = (lines: string[], a: number, b: number) => {
  const out = [...lines];
  [out[a], out[b]] = [out[b] as string, out[a] as string];
  return out;
};

/** verify-nl2.sh must exit non-zero on each, naming what's wrong. Index 0 is the chain header. */
export const NL2_VERIFY_FAIL_CASES: VerifyFailCase[] = [
  {
    name: "a DOCKER-USER rule is missing",
    breakIt: (c) => ({
      ...c,
      dockerUser: c.dockerUser.filter((l) => !l.includes(" -d 10.0.0.0/8 ")),
    }),
    message: /10\.0\.0\.0\/8/,
  },
  {
    name: "an INPUT rule is missing",
    breakIt: (c) => ({ ...c, input: c.input.filter((l) => !l.includes(" -d 10.0.0.5/32 ")) }),
    message: /10\.0\.0\.5/,
  },
  {
    name: "two DOCKER-USER rules are reordered",
    breakIt: (c) => ({ ...c, dockerUser: swap(c.dockerUser, 1, 2) }),
    message: /order/i,
  },
  {
    name: "two INPUT rules are reordered",
    breakIt: (c) => ({ ...c, input: swap(c.input, 1, 2) }),
    message: /order/i,
  },
  {
    name: "an untagged rule sits above the DOCKER-USER drops",
    breakIt: (c) => ({
      ...c,
      dockerUser: [
        c.dockerUser[0] as string,
        "-A DOCKER-USER -j RETURN",
        ...c.dockerUser.slice(1).filter((l) => l !== "-A DOCKER-USER -j RETURN"),
      ],
    }),
    message: /top|order/i,
  },
  {
    name: "the ESTABLISHED accept sits above the INPUT drops",
    breakIt: (c) => {
      const accept = "-A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT";
      return {
        ...c,
        input: [c.input[0] as string, accept, ...c.input.slice(1).filter((l) => l !== accept)],
      };
    },
    message: /top|order|ACCEPT/i,
  },
  {
    name: "an extra tagged rule is present",
    breakIt: (c) => ({
      ...c,
      dockerUser: [
        c.dockerUser[0] as string,
        tagged("DOCKER-USER", "198.51.100.77/32"),
        ...c.dockerUser.slice(1),
      ],
    }),
    message: /198\.51\.100\.77\/32/,
  },
  {
    name: "a tagged rule accepts instead of dropping",
    breakIt: (c) => ({
      ...c,
      dockerUser: c.dockerUser.map((l) =>
        l === tagged("DOCKER-USER", "10.0.0.0/8")
          ? tagged("DOCKER-USER", "10.0.0.0/8", "ACCEPT")
          : l,
      ),
    }),
    message: /ACCEPT/,
  },
];

/** Fixed test titles in nl2-firewall.test.ts (required in test:assert along with the cases). */
export const NL2_TITLES = {
  bareName: (script: string) => `${script} calls tools by bare name only`,
  dockerUserTop:
    "installs a tagged, state-independent DROP at the top of DOCKER-USER for every range and bridge subnet, in order",
  inputTop:
    "installs a tagged DROP at INPUT position 1 for every host address, ahead of the ESTABLISHED accept, in order",
  noAccept: "adds no ACCEPT and no conntrack-state match anywhere",
  onlyTwoChains:
    "touches only DOCKER-USER and INPUT in the filter table: no flush, no policy change, no Docker-owned chain",
  conntrackFlush:
    "then flushes conntrack for the outbound subnet only, once, after the last insert",
  conntrackEmpty: "treats conntrack's '0 flow entries deleted' (exit 1) as success",
  rerun: "a second run produces an identical rule set",
  stale: "deletes stale tagged rules first, never an untagged one",
  failClosed: (c: FailClosedCase) => `fails closed when ${c.name}`,
  helpersOff: (name: string) => `installs when ${name}`,
  uninstall: "uninstall removes only accesslens-nl2-tagged rules, and a second run is harmless",
  verifyPasses: "verify passes on the expected rule set, making only read-only calls",
  verifyAfterInstall: "verify passes right after install",
  verifyMissingChain: "verify fails when DOCKER-USER doesn't exist",
  verifyFails: (c: VerifyFailCase) => `verify fails when ${c.name}`,
  unitOrder:
    "accesslens-nl2.service: After=docker.service accesslens-networks.service and Before=accesslens-stack.service",
  unitOneshot:
    "accesslens-nl2.service: a oneshot that runs install-nl2.sh at every boot (dependents wait for it)",
} as const;

export const NL2_SCRIPTS = ["install-nl2.sh", "uninstall-nl2.sh", "verify-nl2.sh"] as const;

/** Every test title in nl2-firewall.test.ts; test:assert requires each to pass. */
export const NL2_ALL_TITLES: string[] = [
  ...NL2_SCRIPTS.map(NL2_TITLES.bareName),
  NL2_TITLES.dockerUserTop,
  NL2_TITLES.inputTop,
  NL2_TITLES.noAccept,
  NL2_TITLES.onlyTwoChains,
  NL2_TITLES.conntrackFlush,
  NL2_TITLES.conntrackEmpty,
  NL2_TITLES.rerun,
  NL2_TITLES.stale,
  ...NL2_FAIL_CLOSED_CASES.map(NL2_TITLES.failClosed),
  ...NL2_HELPERS_OFF_CASES.map((c) => NL2_TITLES.helpersOff(c.name)),
  NL2_TITLES.uninstall,
  NL2_TITLES.verifyPasses,
  NL2_TITLES.verifyAfterInstall,
  NL2_TITLES.verifyMissingChain,
  ...NL2_VERIFY_FAIL_CASES.map(NL2_TITLES.verifyFails),
  NL2_TITLES.unitOrder,
  NL2_TITLES.unitOneshot,
];
