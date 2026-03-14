type TablePaginationProps = {
  theme: 'light' | 'dark';
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function TablePagination({
  theme,
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  const buttonClass =
    theme === 'dark'
      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:bg-gray-800 disabled:text-gray-500'
      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div
      className={`flex flex-col gap-3 px-4 py-3 border-t text-sm md:flex-row md:items-center md:justify-between ${
        theme === 'dark' ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <span>
          显示 {start}-{end} 条，共 {totalItems} 条
        </span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className={`rounded-lg border px-2 py-1 ${
            theme === 'dark'
              ? 'border-gray-600 bg-gray-700 text-white'
              : 'border-gray-200 bg-white text-gray-900'
          }`}
        >
          {[10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size} / 页
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={`rounded-lg px-3 py-1.5 ${buttonClass}`}
        >
          上一页
        </button>
        <span>
          第 {currentPage} / {totalPages} 页
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={`rounded-lg px-3 py-1.5 ${buttonClass}`}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
