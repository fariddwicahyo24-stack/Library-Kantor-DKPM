const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export function getTaskPointValue(task) {
  const rawPoints = task?.points === undefined ? 1 : Number(task.points);
  return Number.isFinite(rawPoints) ? Math.max(0, rawPoints) : 0;
}

export function getOverdueTaskPenalty(task, now = new Date()) {
  const emptyPenalty = { overdueDays: 0, taskPoints: 0, total: 0 };

  if (!task?.date || task.status === 'Done') return emptyPenalty;

  const deadline = new Date(`${task.date}T${task.time || '23:59'}:00`);
  const currentTime = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(deadline.getTime()) || Number.isNaN(currentTime.getTime()) || currentTime <= deadline) {
    return emptyPenalty;
  }

  const overdueDays = Math.ceil((currentTime - deadline) / MILLISECONDS_PER_DAY);
  const taskPoints = getTaskPointValue(task);

  return {
    overdueDays,
    taskPoints,
    total: taskPoints + overdueDays,
  };
}
