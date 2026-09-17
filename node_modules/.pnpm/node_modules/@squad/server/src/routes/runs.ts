import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PlanError, type Plan } from '@squad/core';
import { RunsManager, RunsManagerError } from '../runs-manager.js';

export interface RunsRoutesOptions {
  runsManager: RunsManager;
}

export const registerRunsRoutes: FastifyPluginAsync<RunsRoutesOptions> = async (
  app: FastifyInstance,
  options: RunsRoutesOptions,
) => {
  const { runsManager } = options;

  // GET /repos/:id/runs
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>(
    '/repos/:id/runs',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1 } },
        },
        querystring: {
          type: 'object',
          properties: { limit: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const limit = request.query.limit !== undefined ? Math.max(1, parseInt(request.query.limit, 10) || 10) : 10;
        const runs = await runsManager.listRuns(request.params.id, limit);
        return reply.code(200).send({ runs });
      } catch (error) {
        return handleRouteError(error, reply);
      }
    },
  );

  // POST /repos/:id/plan
  app.post<{
    Params: { id: string };
    Body: { goal: string };
  }>(
    '/repos/:id/plan',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1 } },
        },
        body: {
          type: 'object',
          required: ['goal'],
          properties: { goal: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await runsManager.makePlan(request.params.id, request.body.goal);
        return reply.code(201).send(result);
      } catch (error) {
        return handleRouteError(error, reply);
      }
    },
  );

  // POST /repos/:id/runs
  app.post<{
    Params: { id: string };
    Body: { runId?: string; plan?: Plan; force?: boolean };
  }>(
    '/repos/:id/runs',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1 } },
        },
        body: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            plan: { type: 'object' },
            force: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await runsManager.startRun(request.params.id, request.body ?? {});
        return reply.code(result.created ? 201 : 200).send({ run: result.run });
      } catch (error) {
        return handleRouteError(error, reply);
      }
    },
  );

  // GET /runs/:id
  app.get<{ Params: { id: string } }>(
    '/runs/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      try {
        const detail = await runsManager.getRunDetail(request.params.id);
        return reply.code(200).send({ run: detail.run, tasks: detail.tasks });
      } catch (error) {
        return handleRouteError(error, reply);
      }
    },
  );

  // GET /runs/:id/events (SSE)
  app.get<{ Params: { id: string } }>(
    '/runs/:id/events',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      try {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        reply.raw.flushHeaders?.();
        reply.hijack();

        let closed = false;
        const sendEvent = (event: unknown, id?: number): void => {
          if (closed) return;
          const idPrefix = id !== undefined ? `id: ${id}\n` : '';
          const eventType = (event as { type?: string })?.type ?? 'message';
          reply.raw.write(`${idPrefix}event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`);
        };

        const close = (): void => {
          if (closed) return;
          closed = true;
          reply.raw.end();
        };

        const lastEventIdHeader = request.headers['last-event-id'];
        const fromEventId = typeof lastEventIdHeader === 'string' ? parseInt(lastEventIdHeader, 10) || 0 : 0;

        const unsubscribe = await runsManager.subscribeEvents(
          request.params.id,
          { sendEvent, close },
          fromEventId,
        );

        request.raw.on('close', () => {
          closed = true;
          unsubscribe();
        });
      } catch (error) {
        if (!reply.raw.headersSent) {
          return handleRouteError(error, reply);
        }
        reply.raw.end();
      }
    },
  );

  // POST /runs/:id/tasks/:taskId/cancel
  app.post<{ Params: { id: string; taskId: string } }>(
    '/runs/:id/tasks/:taskId/cancel',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'taskId'],
          properties: {
            id: { type: 'string', minLength: 1 },
            taskId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        runsManager.cancelTask(request.params.id, request.params.taskId);
        return reply.code(200).send({
          message: `Cancellation requested for task ${request.params.taskId}`,
          runId: request.params.id,
          taskId: request.params.taskId,
        });
      } catch (error) {
        return handleRouteError(error, reply);
      }
    },
  );

  // POST /runs/:id/merge
  app.post<{ Params: { id: string } }>(
    '/runs/:id/merge',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      try {
        const report = await runsManager.mergeRun(request.params.id);
        return reply.code(200).send({ report });
      } catch (error) {
        return handleRouteError(error, reply);
      }
    },
  );
};

function handleRouteError(error: unknown, reply: { code: (c: number) => { send: (body: unknown) => unknown } }) {
  if (error instanceof RunsManagerError) {
    switch (error.code) {
      case 'REPO_NOT_FOUND':
      case 'RUN_NOT_FOUND':
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      case 'RUN_ALREADY_ACTIVE':
      case 'RUN_STILL_ACTIVE':
        return reply.code(409).send({ error: { code: error.code, message: error.message } });
      case 'RUN_NOT_ACTIVE':
      case 'TASK_NOT_CANCELLABLE':
      case 'PLAN_INVALID':
        return reply.code(400).send({ error: { code: error.code, message: error.message } });
    }
  }

  if (error instanceof PlanError) {
    return reply.code(400).send({ error: { code: error.code, message: error.message } });
  }

  throw error;
}
