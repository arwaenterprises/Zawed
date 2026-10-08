import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

// The browser's install event is not in the standard TS lib.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Shows an "install this app" prompt when the browser offers one. */
export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setEvent(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return {
    canInstall: event !== null,
    install: async () => {
      if (!event) return
      await event.prompt()
      await event.userChoice
      setEvent(null)
    },
    dismiss: () => setEvent(null),
  }
}

/** Tells the UI when a new version of the app is waiting, and applies it on request. */
export function useAppUpdate() {
  const [needsUpdate, setNeedsUpdate] = useState(false)
  const updateRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    updateRef.current = registerSW({ onNeedRefresh: () => setNeedsUpdate(true) })
  }, [])

  return {
    needsUpdate,
    applyUpdate: async () => {
      await updateRef.current?.()
    },
    later: () => setNeedsUpdate(false),
  }
}
