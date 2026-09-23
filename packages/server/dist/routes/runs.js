import { PlanError } from '@squad/core';
import { RunsManagerError } from '../runs-manager.js';
export const registerRunsRoutes = async (app, options) => {
    const { runsManager } = options;
    // GET /repos/:id/runs
    app.get('/repos/:id/runs', {
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
    }, async (request, reply) => {
        try {
            const limit = request.query.limit !== undefined ? Math.max(1, parseInt(request.query.limit, 10) || 10) : 10;
            const runs = await runsManager.listRuns(request.params.id, limit);
            return reply.code(200).send({ runs });
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // POST /repos/:id/clarify (Step 0 in workflow)
    app.post('/repos/:id/clarify', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', minLength: 1 } },
            },
            body: {
                type: 'object',
                required: ['goal'],
                properties: { goal: { type: 'string' } },
            },
        },
    }, async (request, reply) => {
        try {
            const result = await runsManager.clarifyGoal(request.params.id, request.body.goal || '');
            return reply.code(200).send(result);
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // POST /repos/:id/plan
    app.post('/repos/:id/plan', {
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
    }, async (request, reply) => {
        try {
            const result = await runsManager.makePlan(request.params.id, request.body.goal);
            return reply.code(201).send(result);
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // POST /repos/:id/chat
    app.post('/repos/:id/chat', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', minLength: 1 } },
            },
            body: {
                type: 'object',
                required: ['message'],
                properties: {
                    message: { type: 'string', minLength: 1 },
                    mode: { type: 'string', enum: ['auto', 'ask', 'plan'] },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const result = await runsManager.handleChat(request.params.id, request.body.message, request.body.mode ?? 'auto');
            return reply.code(200).send(result);
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // GET /repos/:id/file
    app.get('/repos/:id/file', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', minLength: 1 } },
            },
            querystring: {
                type: 'object',
                required: ['path'],
                properties: { path: { type: 'string', minLength: 1 } },
            },
        },
    }, async (request, reply) => {
        try {
            const content = await runsManager.readFileContent(request.params.id, request.query.path);
            return reply.code(200).send({ content, path: request.query.path });
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // POST /repos/:id/runs
    app.post('/repos/:id/runs', {
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
    }, async (request, reply) => {
        try {
            const result = await runsManager.startRun(request.params.id, request.body ?? {});
            return reply.code(result.created ? 201 : 200).send({ run: result.run });
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // GET /runs/:id
    app.get('/runs/:id', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', minLength: 1 } },
            },
        },
    }, async (request, reply) => {
        try {
            const detail = await runsManager.getRunDetail(request.params.id);
            return reply.code(200).send({ run: detail.run, tasks: detail.tasks });
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // GET /runs/:id/events (SSE)
    app.get('/runs/:id/events', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', minLength: 1 } },
            },
        },
    }, async (request, reply) => {
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
            const sendEvent = (event, id) => {
                if (closed)
                    return;
                const idPrefix = id !== undefined ? `id: ${id}\n` : '';
                const eventType = event?.type ?? 'message';
                reply.raw.write(`${idPrefix}event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`);
            };
            const close = () => {
                if (closed)
                    return;
                closed = true;
                reply.raw.end();
            };
            const lastEventIdHeader = request.headers['last-event-id'];
            const fromEventId = typeof lastEventIdHeader === 'string' ? parseInt(lastEventIdHeader, 10) || 0 : 0;
            const unsubscribe = await runsManager.subscribeEvents(request.params.id, { sendEvent, close }, fromEventId);
            request.raw.on('close', () => {
                closed = true;
                unsubscribe();
            });
        }
        catch (error) {
            if (!reply.raw.headersSent) {
                return handleRouteError(error, reply);
            }
            reply.raw.end();
        }
    });
    // POST /runs/:id/tasks/:taskId/cancel
    app.post('/runs/:id/tasks/:taskId/cancel', {
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
    }, async (request, reply) => {
        try {
            runsManager.cancelTask(request.params.id, request.params.taskId);
            return reply.code(200).send({
                message: `Cancellation requested for task ${request.params.taskId}`,
                runId: request.params.id,
                taskId: request.params.taskId,
            });
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // POST /runs/:id/tasks/:taskId/retry
    app.post('/runs/:id/tasks/:taskId/retry', {
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
    }, async (request, reply) => {
        try {
            const result = await runsManager.retryTask(request.params.id, request.params.taskId);
            return reply.code(200).send({
                message: `Retry initiated for task ${request.params.taskId}`,
                runId: result.runId,
                taskId: result.taskId,
            });
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
    // POST /runs/:id/merge
    app.post('/runs/:id/merge', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', minLength: 1 } },
            },
        },
    }, async (request, reply) => {
        try {
            const report = await runsManager.mergeRun(request.params.id);
            return reply.code(200).send({ report });
        }
        catch (error) {
            return handleRouteError(error, reply);
        }
    });
};
function handleRouteError(error, reply) {
    if (error instanceof RunsManagerError) {
        switch (error.code) {
            case 'REPO_NOT_FOUND':
            case 'RUN_NOT_FOUND':
            case 'TASK_NOT_FOUND':
            case 'FILE_NOT_FOUND':
                return reply.code(404).send({ error: { code: error.code, message: error.message } });
            case 'RUN_ALREADY_ACTIVE':
            case 'RUN_STILL_ACTIVE':
                return reply.code(409).send({ error: { code: error.code, message: error.message } });
            case 'RUN_NOT_ACTIVE':
            case 'TASK_NOT_CANCELLABLE':
            case 'PLAN_INVALID':
            case 'INVALID_PATH':
                return reply.code(400).send({ error: { code: error.code, message: error.message } });
        }
    }
    if (error instanceof PlanError) {
        return reply.code(400).send({ error: { code: error.code, message: error.message } });
    }
    throw error;
}
//# sourceMappingURL=runs.js.map