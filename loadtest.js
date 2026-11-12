import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const freeAllowed = new Counter('free_allowed_200');
const freeBlocked = new Counter('free_blocked_429');
const proAllowed  = new Counter('pro_allowed_200');
const proBlocked  = new Counter('pro_blocked_429');
const entAllowed  = new Counter('ent_allowed_200');
const entBlocked  = new Counter('ent_blocked_429');

const entLatency  = new Trend('ent_latency_ms');
const freeLatency = new Trend('free_latency_ms');

export const options = {
  scenarios: {
    noisy_free_tenant: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 10,
      exec: 'freeTraffic',
    },
    pro_tenant: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 10,
      exec: 'proTraffic',
    },
    enterprise_tenant: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 15,
      exec: 'entTraffic',
    },
  },
};

const BASE_URL = `${__ENV.GATEWAY_URL}/api/users`;

export function freeTraffic() {
  const res = http.get(BASE_URL, { headers: { 'x-api-key': __ENV.FREE_KEY } });
  freeLatency.add(res.timings.duration);
  if (res.status === 200) freeAllowed.add(1);
  if (res.status === 429) freeBlocked.add(1);
  check(res, { 'free status 200 or 429': (r) => r.status === 200 || r.status === 429 });
}

export function proTraffic() {
  const res = http.get(BASE_URL, { headers: { 'x-api-key': __ENV.PRO_KEY } });
  if (res.status === 200) proAllowed.add(1);
  if (res.status === 429) proBlocked.add(1);
  check(res, { 'pro status 200': (r) => r.status === 200 });
}

export function entTraffic() {
  const res = http.get(BASE_URL, { headers: { 'x-api-key': __ENV.ENT_KEY } });
  entLatency.add(res.timings.duration);
  if (res.status === 200) entAllowed.add(1);
  if (res.status === 429) entBlocked.add(1);
  check(res, { 'ent status 200': (r) => r.status === 200 });
}
