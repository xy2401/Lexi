<script setup lang="ts">
/**
 * PaginationBar Component
 * 通用标准分页组件：包含条数统计、[首页][上一页][下拉跳页][下一页][尾页]导航以及居右[每页条数选择]
 * 当在底部分页点击切页/改条数时，自动平滑滚动锚点至顶部分页控制栏
 */
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    currentPage: number
    totalPages: number
    totalItems: number
    pageSize: number
    pageSizeOptions?: number[]
    top?: boolean
  }>(),
  {
    pageSizeOptions: () => [10, 20, 50, 100],
    top: false
  }
)

const emit = defineEmits<{
  'update:currentPage': [page: number]
  'update:pageSize': [size: number]
}>()

const barRef = ref<HTMLElement | null>(null)

// 智能计算页码下拉框可选项
const pageSelectOptions = computed(() => {
  const total = props.totalPages
  const curr = props.currentPage
  const opts = new Set<number>()

  opts.add(1)
  opts.add(total)

  for (let i = Math.max(1, curr - 25); i <= Math.min(total, curr + 25); i++) {
    opts.add(i)
  }

  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 4000, 5000]
  for (const s of steps) {
    if (s <= total) opts.add(s)
  }

  return Array.from(opts).sort((a, b) => a - b)
})

// 底部分页触发展示区平滑锚点回顶 (精确对齐顶部分页控制栏)
function scrollToTopAnchor() {
  if (props.top) return // 顶部分页本身就在顶部，无需重复锚点滚动

  // 多标签页用 v-show 共存于 DOM，全局 querySelector 会误选被隐藏的其他标签页元素，
  // 因此限定在当前组件所属的视图容器内查找锚点
  const container = barRef.value?.parentElement
  const target = container?.querySelector('.top-pagination') ||
                 container?.querySelector('.control-panel') ||
                 container

  if (target) {
    const rect = (target as HTMLElement).getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const targetY = rect.top + scrollTop - 12 // 减去 12px 留出舒适边距

    window.scrollTo({
      top: Math.max(0, targetY),
      behavior: 'smooth'
    })
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function setPage(page: number) {
  if (page < 1 || page > props.totalPages || page === props.currentPage) return
  emit('update:currentPage', page)
  scrollToTopAnchor()
}

function onPageSelect(e: Event) {
  const val = parseInt((e.target as HTMLSelectElement).value, 10)
  if (!isNaN(val)) setPage(val)
}

function onPageSizeSelect(e: Event) {
  const size = parseInt((e.target as HTMLSelectElement).value, 10)
  if (!isNaN(size)) {
    emit('update:pageSize', size)
    emit('update:currentPage', 1)
    scrollToTopAnchor()
  }
}
</script>

<template>
  <div ref="barRef" :class="['pagination-bar', { 'top-pagination': top }]">
    <!-- 左侧：数据条数统计 -->
    <div class="page-info-group">
      <span class="total-count">共 <strong>{{ totalItems.toLocaleString() }}</strong> 条</span>
    </div>

    <!-- 右侧：导航与条数切换控制组 -->
    <div class="page-nav-group">
      <button
        :disabled="currentPage === 1"
        @click="setPage(1)"
        class="page-btn nav-btn"
        title="首页"
      >首页</button>

      <button
        :disabled="currentPage === 1"
        @click="setPage(currentPage - 1)"
        class="page-btn nav-btn"
      >上一页</button>

      <!-- 快捷下拉框跳页 -->
      <div class="page-select-wrapper">
        <select :value="currentPage" @change="onPageSelect" class="page-select">
          <option v-for="p in pageSelectOptions" :key="p" :value="p">
            第 {{ p }} 页
          </option>
        </select>
      </div>

      <button
        :disabled="currentPage >= totalPages"
        @click="setPage(currentPage + 1)"
        class="page-btn nav-btn"
      >下一页</button>

      <button
        :disabled="currentPage >= totalPages"
        @click="setPage(totalPages)"
        class="page-btn nav-btn"
        title="尾页"
      >尾页 ({{ totalPages.toLocaleString() }})</button>

      <!-- 每页条数选择器 (居右) -->
      <div class="page-size-selector">
        <select :value="pageSize" @change="onPageSizeSelect" class="page-size-select">
          <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">
            {{ opt }} 条/页
          </option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.top-pagination {
  margin-bottom: 0.75rem;
}

.page-info-group {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  font-size: 0.88rem;
  color: #475569;
}

.total-count strong {
  color: #2563eb;
  font-size: 0.95rem;
}

.page-nav-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.page-btn {
  padding: 0.25rem 0.6rem;
  font-size: 0.82rem;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s;
}

.page-btn:hover:not(:disabled) {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.page-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.page-select-wrapper {
  display: inline-flex;
  align-items: center;
  margin: 0 0.15rem;
}

.page-select,
.page-size-select {
  padding: 0.22rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.82rem;
  color: #1e293b;
  background: #f8fafc;
  cursor: pointer;
  outline: none;
  font-weight: 500;
}

.page-select:focus,
.page-size-select:focus {
  border-color: #3b82f6;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
</style>
