const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const DEADLINE_REMINDER_STAGES = [
  { key: '7d', offsetMs: 7 * DAY_MS, label: '7 hari', channelId: 'dkpm-deadline-normal' },
  { key: '3d', offsetMs: 3 * DAY_MS, label: '3 hari', channelId: 'dkpm-deadline-normal' },
  { key: '1d', offsetMs: DAY_MS, label: '1 hari', channelId: 'dkpm-deadline-urgent' },
  { key: '6h', offsetMs: 6 * HOUR_MS, label: '6 jam', channelId: 'dkpm-deadline-urgent' },
  { key: '2h', offsetMs: 2 * HOUR_MS, label: '2 jam', channelId: 'dkpm-deadline-urgent' },
  { key: '30m', offsetMs: 30 * 60 * 1000, label: '30 menit', channelId: 'dkpm-deadline-urgent' },
  { key: 'due', offsetMs: 0, label: 'sekarang', channelId: 'dkpm-deadline-urgent' },
];

export function parseTaskDeadline(task) {
  if (!task?.date) return null;
  const time = /^\d{2}:\d{2}$/.test(task.time || '') ? task.time : '23:59';
  const deadline = new Date(`${task.date}T${time}:00`);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

export function notificationIdFor(taskId, stageKey) {
  const input = `${taskId}:${stageKey}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff || 1;
}

function reminderBody(task, stage) {
  const owner = task.picName ? ` • PIC: ${task.picName}` : '';
  if (stage.key === 'due') return `Deadline "${task.title || 'Tugas'}" telah tiba.${owner}`;
  return `"${task.title || 'Tugas'}" jatuh tempo dalam ${stage.label}.${owner}`;
}

export function createDeadlineNotificationPlan(tasks, now = new Date(), maxTasks = 30) {
  const nowMs = now.getTime();
  return (tasks || [])
    .filter(task => task && task.status !== 'Done' && !task.isDeleted)
    .map(task => ({ task, deadline: parseTaskDeadline(task) }))
    .filter(({ deadline }) => deadline && deadline.getTime() >= nowMs)
    .sort((a, b) => a.deadline - b.deadline)
    .slice(0, maxTasks)
    .flatMap(({ task, deadline }) => DEADLINE_REMINDER_STAGES
      .map(stage => ({ stage, at: new Date(deadline.getTime() - stage.offsetMs) }))
      .filter(({ at }) => at.getTime() > nowMs)
      .map(({ stage, at }) => ({
        id: notificationIdFor(task.id || task.title || 'task', stage.key),
        title: stage.channelId === 'dkpm-deadline-urgent'
          ? 'Deadline Tugas Mendesak'
          : 'Pengingat Deadline Tugas',
        body: reminderBody(task, stage),
        largeBody: reminderBody(task, stage),
        schedule: { at, allowWhileIdle: true },
        channelId: stage.channelId,
        smallIcon: 'ic_stat_dkpm',
        iconColor: '#F97316',
        group: 'dkpm-deadlines',
        autoCancel: true,
        extra: {
          source: 'dkpm-deadline',
          taskId: task.id || '',
          stage: stage.key,
        },
      })));
}
