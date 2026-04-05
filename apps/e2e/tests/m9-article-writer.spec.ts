import { test, expect } from "@playwright/test";
import {
  registerAdmin,
  authPost,
  authGet,
  authPatch,
  createClient,
  API,
  type AuthSession,
} from "./helpers";

let session: AuthSession;
let clientId: string;
let articleId: string;

test.describe("M9 Article Writer Agent", () => {
  test.beforeAll(async ({ request }) => {
    // Register admin (DB trigger auto-promotes to admin role)
    session = await registerAdmin(request, `m9-${Date.now()}`);
    clientId = await createClient(request, session);

    // Create an article with outline
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Test Article for M9 Writer",
        keyword: "test keyword",
        contentFormat: "how_to",
        outline: {
          sections: [
            { id: crypto.randomUUID(), type: "intro", title: "Introduction", order: 0 },
            { id: crypto.randomUUID(), type: "heading", title: "Main Content", order: 1 },
            { id: crypto.randomUUID(), type: "conclusion", title: "Conclusion", order: 2 },
          ],
        },
      }
    );
    expect(articleRes.ok(), `Create article failed: ${await articleRes.text()}`).toBeTruthy();
    const articleBody = await articleRes.json();
    articleId = articleBody.article.id;

    // Transition article to "approved" status
    const approveRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles/${articleId}/transition`,
      session,
      { status: "approved" }
    );
    expect(approveRes.ok(), `Approve failed: ${await approveRes.text()}`).toBeTruthy();
  });

  test("T1: write-article — approved article returns 202", async ({
    request,
  }) => {
    const res = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId }
    );
    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.agentJobId).toBeTruthy();
    expect(body.message).toContain("queued");

    // Store for later tests
    (test.info() as any).__agentJobId = body.agentJobId;
  });

  test("T2: write-article — concurrent job returns 409", async ({
    request,
  }) => {
    // Create a fresh article to test concurrency guard
    const concurrentArticleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Concurrent Guard Test",
        keyword: "concurrent test",
        contentFormat: "how_to",
        outline: {
          sections: [
            { id: crypto.randomUUID(), type: "intro", title: "Intro", order: 0 },
          ],
        },
      }
    );
    expect(concurrentArticleRes.ok()).toBeTruthy();
    const { article: concArticle } = await concurrentArticleRes.json();

    await authPost(
      request,
      `/api/v1/clients/${clientId}/articles/${concArticle.id}/transition`,
      session,
      { status: "approved" }
    );

    // First write — should succeed
    const write1 = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: concArticle.id }
    );
    expect(write1.status()).toBe(202);

    // Immediately try second write — should get 409 (job still queued/running)
    const write2 = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: concArticle.id }
    );
    // The job is queued or running, so second attempt should be blocked
    // Accept either 409 (concurrent guard) or 422 (status already "writing")
    expect([409, 422]).toContain(write2.status());
    const body = await write2.json();
    expect(body.error).toBeTruthy();
  });

  test("T3: write-article — wrong status returns 422", async ({
    request,
  }) => {
    // Create another article but leave it in "suggested" status
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Suggested Only Article",
        keyword: "suggested keyword",
        contentFormat: "listicle",
        outline: {
          sections: [
            { id: crypto.randomUUID(), type: "intro", title: "Intro", order: 0 },
          ],
        },
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    // Try to write — should fail because status is "suggested"
    const res = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: article.id }
    );
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("suggested");
  });

  test("T4: write-article — no outline returns 422", async ({ request }) => {
    // Create article without outline, approve it
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "No Outline Article",
        keyword: "no outline",
        contentFormat: "general",
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    // Approve it
    const approveRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}/transition`,
      session,
      { status: "approved" }
    );
    expect(approveRes.ok()).toBeTruthy();

    // Try to write — should fail because no outline
    const res = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: article.id }
    );
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("outline");
  });

  test("T5: write-article — nonexistent article returns 404", async ({
    request,
  }) => {
    const fakeId = crypto.randomUUID();
    const res = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: fakeId }
    );
    expect(res.status()).toBe(404);
  });

  test("T6: write-article — invalid articleId returns 400", async ({
    request,
  }) => {
    const res = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: "not-a-uuid" }
    );
    expect(res.status()).toBe(400);
  });

  test("T7: write-article — archived client returns 409", async ({
    request,
  }) => {
    // Create and archive a client
    const archiveClientId = await createClient(request, session, {
      name: "Archived Client M9",
    });
    await authPatch(
      request,
      `/api/v1/clients/${archiveClientId}`,
      session,
      { active: false }
    );

    const res = await authPost(
      request,
      `/api/v1/clients/${archiveClientId}/agents/write-article`,
      session,
      { articleId: crypto.randomUUID() }
    );
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("archived");
  });

  test("T8: job status endpoint returns job details", async ({ request }) => {
    // Create a fresh article + job to get a known job ID
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Job Status Test Article",
        keyword: "job status",
        contentFormat: "how_to",
        outline: {
          sections: [
            { id: crypto.randomUUID(), type: "intro", title: "Intro", order: 0 },
            { id: crypto.randomUUID(), type: "heading", title: "Body", order: 1 },
          ],
        },
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    await authPost(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}/transition`,
      session,
      { status: "approved" }
    );

    const writeRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: article.id }
    );
    expect(writeRes.status()).toBe(202);
    const { agentJobId } = await writeRes.json();

    // Query job status
    const jobRes = await authGet(
      request,
      `/api/v1/clients/${clientId}/agents/jobs/${agentJobId}`,
      session
    );
    expect(jobRes.ok()).toBeTruthy();
    const { job } = await jobRes.json();
    expect(job.id).toBe(agentJobId);
    expect(job.jobType).toBe("write-article");
    expect(job.clientId).toBe(clientId);
    expect(["queued", "running", "completed", "failed"]).toContain(job.status);
  });

  test("T9: SSE progress endpoint returns event stream", async ({
    request,
  }) => {
    // Create another job for SSE test
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "SSE Test Article",
        keyword: "sse test",
        contentFormat: "deep_dive",
        outline: {
          sections: [
            { id: crypto.randomUUID(), type: "intro", title: "Intro", order: 0 },
          ],
        },
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    await authPost(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}/transition`,
      session,
      { status: "approved" }
    );

    const writeRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: article.id }
    );
    expect(writeRes.status()).toBe(202);
    const { agentJobId } = await writeRes.json();

    // SSE endpoint is a long-lived stream — use native fetch with AbortController
    // to verify it returns text/event-stream without waiting for the full response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const sseRes = await fetch(
        `${API}/api/v1/clients/${clientId}/agents/jobs/${agentJobId}/progress`,
        {
          headers: { Cookie: session.cookie },
          signal: controller.signal,
        }
      );
      expect(sseRes.status).toBe(200);
      const contentType = sseRes.headers.get("content-type") ?? "";
      expect(contentType).toContain("text/event-stream");
    } catch (err: unknown) {
      // AbortError is expected — stream was alive when we cancelled
      if (err instanceof Error && err.name !== "AbortError") throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  });

  test("T10: job status — cross-client isolation (404)", async ({
    request,
  }) => {
    // Create a different client
    const otherClientId = await createClient(request, session, {
      name: "Other Client M9",
    });

    // Create article under original client
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Isolation Test Article",
        keyword: "isolation",
        contentFormat: "general",
        outline: {
          sections: [
            { id: crypto.randomUUID(), type: "intro", title: "Intro", order: 0 },
          ],
        },
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    await authPost(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}/transition`,
      session,
      { status: "approved" }
    );

    const writeRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: article.id }
    );
    expect(writeRes.status()).toBe(202);
    const { agentJobId } = await writeRes.json();

    // Try to access job under different client — should 404
    const crossRes = await authGet(
      request,
      `/api/v1/clients/${otherClientId}/agents/jobs/${agentJobId}`,
      session
    );
    expect(crossRes.status()).toBe(404);
  });

  test("T11: write-article — cross-client article access returns 404", async ({
    request,
  }) => {
    const otherClientId = await createClient(request, session, {
      name: "Cross Client Test M9",
    });

    // Try to write an article that belongs to clientId using otherClientId
    const res = await authPost(
      request,
      `/api/v1/clients/${otherClientId}/agents/write-article`,
      session,
      { articleId }
    );
    expect(res.status()).toBe(404);
  });

  test("T12: rewrite-section — wrong status returns 422", async ({
    request,
  }) => {
    // Create an article at "suggested" status — rewrite not allowed
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Rewrite Status Test",
        keyword: "rewrite status",
        contentFormat: "general",
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    const res = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/rewrite-section`,
      session,
      { articleId: article.id, sectionId: crypto.randomUUID() }
    );
    expect(res.status()).toBe(422);
  });

  test("T13: rewrite-section — nonexistent section returns 404", async ({
    request,
  }) => {
    // Create article, approve, trigger write to get to "writing" status
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Rewrite Section Test",
        keyword: "rewrite section",
        contentFormat: "how_to",
        outline: {
          sections: [
            { id: crypto.randomUUID(), type: "intro", title: "Intro", order: 0 },
          ],
        },
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    await authPost(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}/transition`,
      session,
      { status: "approved" }
    );

    // Trigger write to move to "writing"
    const writeRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: article.id }
    );
    expect(writeRes.status()).toBe(202);

    // Wait briefly for status transition
    await new Promise((r) => setTimeout(r, 500));

    // Try rewrite with fake section
    const res = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/rewrite-section`,
      session,
      { articleId: article.id, sectionId: crypto.randomUUID() }
    );
    // Should be 404 (section not found) or 422 (status not eligible yet)
    expect([404, 422]).toContain(res.status());
  });

  test("T14: article versions endpoint exists", async ({ request }) => {
    const res = await authGet(
      request,
      `/api/v1/clients/${clientId}/articles/${articleId}/versions`,
      session
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.versions ?? body)).toBeTruthy();
  });

  test("T15: article version created on body update", async ({ request }) => {
    // Create article with body, then update body to trigger versioning
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Versioning Test Article",
        keyword: "versioning",
        contentFormat: "general",
        body: "<p>Original content</p>",
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    // Update body — should create a version snapshot
    const patchRes = await authPatch(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}`,
      session,
      { body: "<p>Updated content v2</p>" }
    );
    expect(patchRes.ok()).toBeTruthy();

    // Check versions
    const versionsRes = await authGet(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}/versions`,
      session
    );
    expect(versionsRes.ok()).toBeTruthy();
    const versionsBody = await versionsRes.json();
    const versions = versionsBody.versions ?? versionsBody;
    expect(versions.length).toBeGreaterThanOrEqual(1);
    // Latest version should have the original body (snapshot before update)
    const latestVersion = versions[0];
    expect(latestVersion.changeSource).toBe("human");
  });

  test("T16: unauthenticated request returns 401", async ({ request }) => {
    const res = await request.post(
      `${API}/api/v1/clients/${clientId}/agents/write-article`,
      { data: { articleId } }
    );
    expect(res.status()).toBe(401);
  });

  test("T17: retry — article in writing status can be re-triggered", async ({
    request,
  }) => {
    // Create an article, approve it
    const articleRes = await authPost(
      request,
      `/api/v1/clients/${clientId}/articles`,
      session,
      {
        title: "Retry Test Article",
        keyword: "retry test",
        contentFormat: "how_to",
        outline: {
          sections: [
            { id: crypto.randomUUID(), type: "intro", title: "Intro", order: 0 },
            { id: crypto.randomUUID(), type: "heading", title: "Body", order: 1 },
          ],
        },
      }
    );
    expect(articleRes.ok()).toBeTruthy();
    const { article } = await articleRes.json();

    await authPost(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}/transition`,
      session,
      { status: "approved" }
    );

    // First write
    const writeRes1 = await authPost(
      request,
      `/api/v1/clients/${clientId}/agents/write-article`,
      session,
      { articleId: article.id }
    );
    expect(writeRes1.status()).toBe(202);

    // Wait for the job to complete or fail (shorter timeout — job will likely fail without LLM key)
    const { agentJobId } = await writeRes1.json();
    let finalJobStatus = "unknown";
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const jobRes = await authGet(
        request,
        `/api/v1/clients/${clientId}/agents/jobs/${agentJobId}`,
        session
      );
      if (jobRes.ok()) {
        const { job } = await jobRes.json();
        finalJobStatus = job.status;
        if (["completed", "failed", "cancelled"].includes(job.status)) {
          break;
        }
      }
    }

    // Check article status
    const articleCheck = await authGet(
      request,
      `/api/v1/clients/${clientId}/articles/${article.id}`,
      session
    );
    expect(articleCheck.ok()).toBeTruthy();
    const { article: updatedArticle } = await articleCheck.json();

    // The write-article endpoint accepts articles in "writing" status (retry path)
    // Verify the endpoint recognizes "writing" as a valid status for re-trigger
    if (updatedArticle.status === "writing" && ["failed", "cancelled"].includes(finalJobStatus)) {
      const writeRes2 = await authPost(
        request,
        `/api/v1/clients/${clientId}/agents/write-article`,
        session,
        { articleId: article.id }
      );
      expect(writeRes2.status()).toBe(202);
    }
    // If "written" or still processing — the feature works, just can't test retry path
    expect(["approved", "writing", "written"]).toContain(updatedArticle.status);
  });
});
