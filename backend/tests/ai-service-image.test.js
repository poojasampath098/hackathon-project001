process.env.JWT_SECRET = "test-jwt-secret-ai-image";

const aiService = require("../src/services/ai.service");

describe("ai.service buildImageDataUri", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    if (realFetch) global.fetch = realFetch;
    else delete global.fetch;
  });

  test("builds a base64 data URI from a fetched image", async () => {
    const buf = Buffer.from("hello");
    global.fetch = jest.fn().mockResolvedValue(
      new Response(buf, { status: 200, headers: { "content-type": "image/png" } })
    );

    const uri = await aiService.buildImageDataUri("https://cdn.example.com/a.png");
    expect(uri).toBe(`data:image/png;base64,${buf.toString("base64")}`);
    expect(global.fetch).toHaveBeenCalledWith("https://cdn.example.com/a.png");
  });

  test("rejects a non-HTTPS URL", async () => {
    global.fetch = jest.fn();
    await expect(aiService.buildImageDataUri("http://cdn.example.com/a.png")).rejects.toThrow(
      /invalid image url/i
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("rejects a failed fetch response", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(null, { status: 500 })
    );
    await expect(aiService.buildImageDataUri("https://cdn.example.com/a.png")).rejects.toThrow(
      /HTTP 500/i
    );
  });

  test("rejects an image larger than the limit", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(big, { status: 200, headers: { "content-type": "image/png" } })
    );
    await expect(aiService.buildImageDataUri("https://cdn.example.com/big.png")).rejects.toThrow(
      /5MB/i
    );
  });
});
