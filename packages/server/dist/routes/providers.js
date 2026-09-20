export const registerProvidersRoutes = async (app, options) => {
    const { registry, providersManager } = options;
    // GET /providers
    app.get('/providers', async (_request, reply) => {
        try {
            const providers = await providersManager.getProviders();
            return reply.code(200).send({ providers });
        }
        catch (error) {
            return reply.code(500).send({
                error: { code: 'PROVIDERS_LOAD_ERROR', message: error instanceof Error ? error.message : String(error) },
            });
        }
    });
    // POST /providers/save
    app.post('/providers/save', {
        schema: {
            body: {
                type: 'object',
                required: ['providers'],
                properties: {
                    providers: { type: 'array' },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const saved = await providersManager.saveProviders(request.body.providers);
            return reply.code(200).send({ providers: saved });
        }
        catch (error) {
            return reply.code(400).send({
                error: { code: 'PROVIDERS_SAVE_ERROR', message: error instanceof Error ? error.message : String(error) },
            });
        }
    });
    // POST /providers/test
    app.post('/providers/test', {
        schema: {
            body: {
                type: 'object',
                required: ['providerId'],
                properties: {
                    providerId: { type: 'string' },
                    baseUrl: { type: 'string' },
                    apiKey: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const result = await providersManager.testConnection(request.body);
        return reply.code(200).send(result);
    });
    // GET /repos/:id/config
    app.get('/repos/:id/config', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string' } },
            },
        },
    }, async (request, reply) => {
        const repo = registry.get(request.params.id);
        if (!repo) {
            return reply.code(404).send({
                error: { code: 'REPO_NOT_FOUND', message: `Repository ${request.params.id} not found.` },
            });
        }
        try {
            const config = await providersManager.getRepoConfig(repo.path);
            return reply.code(200).send({ config });
        }
        catch (error) {
            return reply.code(400).send({
                error: { code: 'CONFIG_LOAD_ERROR', message: error instanceof Error ? error.message : String(error) },
            });
        }
    });
    // PUT /repos/:id/config
    app.put('/repos/:id/config', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string' } },
            },
            body: {
                type: 'object',
                required: ['config'],
                properties: { config: { type: 'object' } },
            },
        },
    }, async (request, reply) => {
        const repo = registry.get(request.params.id);
        if (!repo) {
            return reply.code(404).send({
                error: { code: 'REPO_NOT_FOUND', message: `Repository ${request.params.id} not found.` },
            });
        }
        try {
            const updated = await providersManager.updateRepoConfig(repo.path, request.body.config);
            return reply.code(200).send({ config: updated });
        }
        catch (error) {
            return reply.code(400).send({
                error: { code: 'CONFIG_UPDATE_ERROR', message: error instanceof Error ? error.message : String(error) },
            });
        }
    });
};
//# sourceMappingURL=providers.js.map