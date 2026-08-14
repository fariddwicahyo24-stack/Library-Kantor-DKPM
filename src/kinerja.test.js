import test from 'node:test';
import assert from 'node:assert/strict';

import { getOverdueTaskPenalty, getTaskPointValue } from './kinerja.js';

test('penalti tugas aktif mencakup bobot tugas dan jumlah hari keterlambatan', () => {
  const now = new Date('2026-08-14T12:00:00');
  const task = { date: '2026-08-11', time: '17:00', status: 'To Do', points: 10 };

  assert.deepEqual(getOverdueTaskPenalty(task, now), {
    overdueDays: 3,
    taskPoints: 10,
    total: 13,
  });
});

test('dua tugas terlambat dihitung masing-masing, bukan hanya total harinya', () => {
  const now = new Date('2026-08-14T12:00:00');
  const tasks = [
    { date: '2026-08-11', time: '17:00', status: 'In Progress', points: 10 },
    { date: '2026-08-12', time: '17:00', status: 'To Do', points: 15 },
  ];
  const totalPenalty = tasks.reduce((total, task) => total + getOverdueTaskPenalty(task, now).total, 0);

  assert.equal(totalPenalty, 30);
});

test('tugas selesai atau belum melewati deadline tidak mendapat penalti aktif', () => {
  const now = new Date('2026-08-14T12:00:00');

  assert.equal(getOverdueTaskPenalty({ date: '2026-08-11', time: '17:00', status: 'Done', points: 10 }, now).total, 0);
  assert.equal(getOverdueTaskPenalty({ date: '2026-08-15', time: '17:00', status: 'To Do', points: 10 }, now).total, 0);
});

test('nilai tugas lama tetap memakai satu poin dan nilai negatif tidak mengurangi penalti', () => {
  assert.equal(getTaskPointValue({}), 1);
  assert.equal(getTaskPointValue({ points: -5 }), 0);
  assert.equal(getTaskPointValue({ points: 'tidak-valid' }), 0);
});
