import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Main from './pages/Main';
import Home from './pages/home/Home';
import AccountLinkingPage from './pages/accountLinkingPage/AccountLinkingPage';
import AccountLinkingProofPage from './pages/accountLinkingPage/AccountLinkingProofPage';
import AccountLinkingResumePage from './pages/accountLinkingPage/AccountLinkingResumePage';
import { prepareProofResume } from './utils/proof-resume';
import { Error as ErrorPage, Settings, ToastViewport } from '@sanny/ui';

const apiUrl = import.meta.env.VITE_API_URL;

const router = createBrowserRouter(
  [
    {
      path: '/account-link-proof-resume',
      element: <AccountLinkingResumePage />,
      loader: () =>
        prepareProofResume(apiUrl, window.location.hash, () => sessionStorage),
    },
    {
      element: <Main />,
      errorElement: <ErrorPage />,
      children: [
        { path: '/', element: <Home /> },
        { path: '/settings', element: <Settings /> },
        {
          path: '/confirm-linking',
          element: <AccountLinkingPage />,
        },
        {
          path: '/account-link-proof-complete',
          element: <AccountLinkingProofPage />,
        },
        { path: '*', element: <ErrorPage status={404} /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL }
);

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastViewport />
    </>
  );
}

export default App;
