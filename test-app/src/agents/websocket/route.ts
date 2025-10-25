import { createRouter } from '@agentuity/server';

const router = createRouter();

router.websocket('/', (c) => (ws) => {
	ws.onOpen(async () => {
		ws.send('Will sending data every 1s');
	});
	ws.onMessage(async (event) => {
		const value = await c.agent.websocket.run(event.data as string);
		ws.send(JSON.stringify(value));
	});
});

export default router;
