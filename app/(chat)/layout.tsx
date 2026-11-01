import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"

// The one rolling conversation, rendered at "/". It lives in the layout so
// navigating inside the group never remounts useChat mid-stream.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <LayoutApp>
      <ChatContainer />
      {children}
    </LayoutApp>
  )
}
