const C = await import('file:///E:/Land-XI 플랫폼/01. 디자인/tools/check/common.mjs');
const [role = 'app', paths = '/landxi/v3/lx-console/'] = process.argv.slice(2);
const b = await C.launch();
const [base, id, tenant] = C.LOGIN[role]();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await C.frontDoor(p, base, id, tenant ? { tenant, password: C.PW } : { password: C.PW });
await p.waitForTimeout(3000);
const home = new URL(p.url()).origin;
for (const path of paths.split(',')) {
  await p.goto(home + path, { waitUntil: 'commit' });
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => performance.getEntriesByType('resource').filter((e) => /fetch|xmlhttp/.test(e.initiatorType) && /\/api\//.test(e.name)).map((e) => [Math.round(e.startTime), Math.round(e.responseEnd), e.name.replace(location.origin, '')]));
  console.log('== ' + path); for (const x of r.filter((x) => x[0] < 3000)) console.log(x.join('\t'));
}
await b.close();
