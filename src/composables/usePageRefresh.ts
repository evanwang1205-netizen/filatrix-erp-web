import { onBeforeUnmount, onMounted } from 'vue';

type PageRefreshHandler = () => void | Promise<void>;

let currentPageRefreshHandler: PageRefreshHandler | undefined;

export function usePageRefresh(handler: PageRefreshHandler) {
  onMounted(() => {
    currentPageRefreshHandler = handler;
  });

  onBeforeUnmount(() => {
    if (currentPageRefreshHandler === handler) {
      currentPageRefreshHandler = undefined;
    }
  });
}

export async function refreshCurrentPage() {
  await currentPageRefreshHandler?.();
}
