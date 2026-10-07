import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api/client.js'

afterEach(() => vi.unstubAllGlobals())

describe('browser API client', () => {
  it('accepts JSON arrays from lessons and sessions', async () => {
    const chapters = [{ id: 0, title: 'はじめに', steps: [] }]
    const sessions = [{ id: 'A', connected: false }]
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(chapters)))
      .mockResolvedValueOnce(new Response(JSON.stringify(sessions)))
    vi.stubGlobal('fetch', fetch)

    expect(await api.lessons()).toEqual(chapters)
    expect(await api.sessions()).toEqual(sessions)
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/lessons', {})
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sessions', {})
  })

  it('still reports a non-JSON proxy response as an API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy error</html>', { status: 502 })))

    await expect(api.lessons()).rejects.toThrow('API から予期しない応答がありました（HTTP 502）。')
  })
})
