import * as FailADrive from '../dist/fail-a-drive.mjs';

window.FailADrive = FailADrive;
window.events = [];
for (const type of ['faildrive:status', 'faildrive:rebuild']) {
  document.addEventListener(type, (e) => window.events.push({ type, detail: e.detail }));
}
window.ready = true;
