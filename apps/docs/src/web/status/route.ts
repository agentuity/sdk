import { createRouter } from "@agentuity/runtime";

const router = createRouter();

router.get("/", (c) => {
	return c.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		version: "1.0.0",
	});
});

export default router;
