import { createHashRouter, Navigate } from 'react-router-dom';
import { ChatLayout } from '@/features/chat/ChatLayout';
import { ChatPage } from '@/features/chat/ChatPage';

/**
 * Hash-based router so packaged Electron (file://) builds still resolve routes.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <ChatLayout />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'chat/:chatId', element: <ChatPage /> },
    ],
  },
]);
