import { describe, expect, it } from 'vitest'
import { describeUserAgent } from '@/server/auth/user-agent'

/** "Chrome on Windows": enough for a person to recognise their own devices. */
describe('describeUserAgent', () => {
  it('names the common browsers and systems', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36')).toBe('Chrome on Windows')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0')).toBe('Edge on Windows')
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone')
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/127.0.0.0 Mobile Safari/537.36')).toBe('Chrome on Android')
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36')).toBe('Samsung Internet on Android')
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Gecko/20100101 Firefox/129.0')).toBe('Firefox on Mac')
  })

  it('degrades to what it can tell, and to "Unknown device" for nothing', () => {
    expect(describeUserAgent('curl/8.4.0')).toBe('Unknown device')
    expect(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux')
    expect(describeUserAgent(null)).toBe('Unknown device')
    expect(describeUserAgent('')).toBe('Unknown device')
  })
})
