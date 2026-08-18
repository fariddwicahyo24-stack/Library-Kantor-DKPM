import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeadlineNotificationPlan,
  notificationIdFor,
  parseTaskDeadline,
} from './deadlineNotifications.js';

const now = new Date('2026-08-14T08:00:00');

test('parses the task deadline in local time and defaults to end of day', () => {
  assert.equal(parseTaskDeadline({ date: '2026-08-20', time: '14:30' }).getHours(), 14);
  assert.equal(parseTaskDeadline({ date: '2026-08-20' }).getHours(), 23);
  assert.equal(parseTaskDeadline({}), null);
});

test('creates seven increasingly frequent reminders for a distant deadline', () => {
  const plan = createDeadlineNotificationPlan([
    { id: 'task-1', title: 'Desain laporan', date: '2026-08-24', time: '08:00', status: 'On Progress' },
  ], now);

  assert.equal(plan.length, 7);
  assert.equal(plan[0].channelId, 'dkpm-deadline-normal');
  assert.equal(plan.at(-1).channelId, 'dkpm-deadline-urgent');
  assert.equal(plan.at(-1).extra.stage, 'due');
});

test('omits expired stages and inactive tasks', () => {
  const plan = createDeadlineNotificationPlan([
    { id: 'near', title: 'Tugas dekat', date: '2026-08-14', time: '10:00', status: 'On Progress' },
    { id: 'done', title: 'Selesai', date: '2026-08-20', status: 'Done' },
    { id: 'deleted', title: 'Dihapus', date: '2026-08-20', isDeleted: true },
    { id: 'past', title: 'Terlambat', date: '2026-08-13', status: 'On Progress' },
  ], now);

  assert.deepEqual(plan.map(item => item.extra.stage), ['30m', 'due']);
});

test('notification identifiers are stable and differ per reminder stage', () => {
  assert.equal(notificationIdFor('abc', '1d'), notificationIdFor('abc', '1d'));
  assert.notEqual(notificationIdFor('abc', '1d'), notificationIdFor('abc', '6h'));
  assert.ok(notificationIdFor('abc', '1d') > 0);
});
