/* @flow */

import logUpdate from 'log-update';
import chalk from 'chalk';

type Task = {
  name: string,
  thunk?: () => Promise,
  subtasks?: Array<Task>,
}

export default class TaskRunner {
  tasks: Array<Task>;

  constructor(tasks: Array<Task>) {
    this.tasks = tasks;
  }

  async run() {
    const taskStatuses = [];

    const spinner = function () {
      let frame = 0;
      const frames = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];

      return function spinner() {
        const currentFrame = frames[frame];
        frame = (frame + 1) % frames.length;
        return currentFrame;
      }
    }();

    function progress(n, total) {
      const text = `[${n + 1}/${total}]`;
      return chalk.dim(text);
    }

    const interval = setInterval(() => {
      const message = taskStatuses.map(({ index, total, status }, n) => {
        const formatter = n === 0 ? chalk.bold : chalk.reset;
        return `${progress(index, total)} ${formatter(status)}`;
      }).join(chalk.gray(' → '));

      logUpdate(`${chalk.green.bold(spinner())} ${message}`);
    }, 100);

    async function runTask(task: Task, index, total, parentTasks: Array<Task> = []) {
      const status = 'Whatever';

      taskStatuses.push({
        index,
        total,
        status: task.name,
      });

      if (task.thunk) {
        await task.thunk();
      }

      if (task.subtasks) {
        let n = 0;
        for (const subtask of task.subtasks) {
          await runTask(subtask, n++, task.subtasks.length, [task, ...parentTasks]);
        }
      }

      taskStatuses.pop();
    }

    let n = 0;
    const total = this.tasks.length;
    for (const task of this.tasks) {
      try {
        await runTask(task, n, this.tasks.length);
      } catch (e) {
        logUpdate(
          `${chalk.red.bold('x')} ${progress(n, total)} ${chalk.bold(task.name)}: ${e.message}`,
        );

        throw e;
      }

      logUpdate(`${chalk.green.bold('✓')} ${progress(n, total)} ${chalk.bold(task.name)}`);
      console.log();
      n++;
    }

    clearInterval(interval);
  }
}
