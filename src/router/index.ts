import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/home/HomeView.vue'),
  },
  {
    path: '/sync',
    name: 'sync',
    component: () => import('@/views/sync/SyncView.vue'),
  },
  {
    path: '/config',
    name: 'config',
    component: () => import('@/views/config/ConfigView.vue'),
  },
  {
    path: '/reader/:pageId',
    name: 'reader',
    component: () => import('@/views/reader/ReaderView.vue'),
    props: true,
  },
  {
    path: '/test',
    name: 'test',
    component: () => import('@/views/test/TestView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
