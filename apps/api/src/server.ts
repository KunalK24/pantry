import Fastify from 'fastify'

const server = Fastify({
    logger: true
})

server.get('/', async () => {
    return {
        reply: 'hello world'
    }
})

server.get('/health', async () => {
    return {
        status: 'ok'
    }
})

const start = async () => {
    try {
        await server.listen({
            port: 3001,
            host: '0.0.0.0',
        })
    } catch (error) {
        server.log.error(error)
        process.exit(1)
    }
}

start()