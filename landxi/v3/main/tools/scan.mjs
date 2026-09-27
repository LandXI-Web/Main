/* K16 scan() 을 페이지 안에서 돌리는 문자열(키트 forbidden.mjs 를 그대로 import) */
import { RULES, scan } from '../../kit/lint/forbidden.mjs';
export const forbiddenScan = `(() => { const RULES = [${RULES.map(([k, re]) => `[${JSON.stringify(k)}, ${re}]`).join(',')}]; const check = (s) => RULES.filter(([, re]) => re.test(s)).map(([k]) => k); return (${scan.toString()})(document); })()`;
