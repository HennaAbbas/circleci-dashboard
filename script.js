const { useState, useEffect, useMemo } = React;

// Main Dashboard Component
const CircleCIDataDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});
  const [activeFilters, setActiveFilters] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [columnOptions, setColumnOptions] = useState({});
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({});

  // Load the CSV file
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Change this to your CSV filename
        const csvFile = '20241101_to_20241201_70e4e661856348a08598e73aec089cae.csv';
        
        const response = await fetch(csvFile);
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            // Clean up data - replace "\\N" with null for better display
            const cleanData = results.data.map(row => {
              const cleanRow = {};
              Object.keys(row).forEach(key => {
                cleanRow[key] = row[key] === "\\\\N" ? null : row[key];
              });
              return cleanRow;
            });
            
            setData(cleanData);
            
            // Set initial visible columns (limit to important ones for better UI)
            const initialVisibleColumns = [
              'ORGANIZATION_NAME', 
              'PROJECT_NAME', 
              'VCS_NAME', 
              'VCS_BRANCH', 
              'JOB_NAME', 
              'JOB_BUILD_STATUS', 
              'OPERATING_SYSTEM', 
              'EXECUTOR',
              'TOTAL_CREDITS'
            ];
            setVisibleColumns(initialVisibleColumns);
            
            // Generate filter options for each column
            const options = {};
            results.meta.fields.forEach(field => {
              // Get unique values for this column
              const uniqueValues = [...new Set(cleanData.map(item => item[field]))].filter(x => x !== null);
              options[field] = uniqueValues.sort();
            });
            setColumnOptions(options);
            
            // Calculate basic stats
            calculateStats(cleanData);
            
            setLoading(false);
          },
          error: (error) => {
            setError(`Error parsing CSV: ${error.message}`);
            setLoading(false);
          }
        });
      } catch (error) {
        setError(`Error loading file: ${error.message}`);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculate statistics from the data
  const calculateStats = (data) => {
    const stats = {
      totalJobs: data.length,
      successfulJobs: data.filter(job => job.JOB_BUILD_STATUS === 'success').length,
      failedJobs: data.filter(job => job.JOB_BUILD_STATUS === 'failed').length,
      totalCredits: _.sumBy(data, 'TOTAL_CREDITS'),
      averageJobRuntime: _.meanBy(
        data.filter(job => job.JOB_RUN_SECONDS && job.JOB_RUN_SECONDS !== null), 
        'JOB_RUN_SECONDS'
      )
    };
    
    setStats(stats);
  };

  // Filter data based on active filters
  const filteredData = useMemo(() => {
    if (Object.keys(activeFilters).length === 0 && !searchTerm) {
      return data;
    }

    return data.filter(item => {
      // Check if the item matches all active filters
      const matchesFilters = Object.entries(activeFilters).every(([field, value]) => {
        if (!value || value.length === 0) return true;
        return value.includes(item[field]);
      });
      
      // Check global search term
      const matchesSearch = !searchTerm || Object.values(item).some(val => {
        if (val === null) return false;
        return String(val).toLowerCase().includes(searchTerm.toLowerCase());
      });
      
      return matchesFilters && matchesSearch;
    });
  }, [data, activeFilters, searchTerm]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      // Handle null values in sorting
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue === null) return sortConfig.direction === 'asc' ? -1 : 1;
      
      // Compare based on data type
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      // String comparison
      const aString = String(aValue).toLowerCase();
      const bString = String(bValue).toLowerCase();
      
      if (sortConfig.direction === 'asc') {
        return aString.localeCompare(bString);
      } else {
        return bString.localeCompare(aString);
      }
    });
  }, [filteredData, sortConfig]);

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedData, currentPage, rowsPerPage]);

  // Handle sorting
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Handle filter changes
  const handleFilterChange = (field, value) => {
    setFilters({
      ...filters,
      [field]: value
    });
  };

  // Apply filters
  const applyFilters = () => {
    setActiveFilters(filters);
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({});
    setActiveFilters({});
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Toggle column visibility
  const toggleColumnVisibility = (column) => {
    if (visibleColumns.includes(column)) {
      setVisibleColumns(visibleColumns.filter(col => col !== column));
    } else {
      setVisibleColumns([...visibleColumns, column]);
    }
  };

  // Calculate total pages
  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  // Format value for display
  const formatValue = (value, column) => {
    if (value === null) return "—";
    
    // Format dates
    if (column.includes('DATE') || column.includes('_AT')) {
      if (typeof value === 'string' && value.includes('-')) {
        return value;
      }
    }
    
    // Format numbers
    if (column.includes('CREDITS') && typeof value === 'number') {
      return value.toFixed(2);
    }
    
    return String(value);
  };

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-lg">Loading data...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Jobs</h3>
          <p className="text-2xl font-bold">{stats.totalJobs?.toLocaleString() || 0}</p>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="text-sm font-medium text-gray-500">Success Rate</h3>
          <p className="text-2xl font-bold">
            {stats.totalJobs ? ((stats.successfulJobs / stats.totalJobs) * 100).toFixed(1) : 0}%
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Credits</h3>
          <p className="text-2xl font-bold">{stats.totalCredits?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || 0}</p>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="text-sm font-medium text-gray-500">Avg. Runtime (sec)</h3>
          <p className="text-2xl font-bold">{stats.averageJobRuntime?.toFixed(1) || 'N/A'}</p>
        </div>
      </div>
      
      {/* Search and Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search all columns..."
            className="w-full p-2 border rounded"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        
        <div className="flex gap-2">
          <select 
            className="p-2 border rounded"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10 rows</option>
            <option value={20}>20 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
          
          <div className="relative">
            <button 
              className="p-2 border rounded bg-white"
              onClick={() => document.getElementById('column-selector').classList.toggle('hidden')}
            >
              Columns
            </button>
            <div 
              id="column-selector" 
              className="absolute right-0 mt-1 w-64 bg-white border rounded shadow-lg p-2 z-10 hidden max-h-96 overflow-y-auto"
            >
              {data.length > 0 && Object.keys(data[0]).map(column => (
                <div key={column} className="flex items-center p-1">
                  <input
                    type="checkbox"
                    id={`col-${column}`}
                    checked={visibleColumns.includes(column)}
                    onChange={() => toggleColumnVisibility(column)}
                    className="mr-2"
                  />
                  <label htmlFor={`col-${column}`} className="text-sm">{column}</label>
                </div>
              ))}
            </div>
          </div>
          
          <button 
            className="p-2 border rounded bg-blue-500 text-white"
            onClick={() => document.getElementById('filter-panel').classList.toggle('hidden')}
          >
            Filters
          </button>
        </div>
      </div>
      
      {/* Filter Panel */}
      <div id="filter-panel" className="bg-gray-100 p-4 rounded shadow hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {Object.keys(columnOptions)
            .filter(column => ['ORGANIZATION_NAME', 'PROJECT_NAME', 'VCS_NAME', 'VCS_BRANCH', 'JOB_BUILD_STATUS', 'OPERATING_SYSTEM', 'EXECUTOR'].includes(column))
            .map(column => (
              <div key={column} className="flex flex-col">
                <label className="text-sm font-medium mb-1">{column}</label>
                <select
                  className="w-full p-2 border rounded"
                  value={filters[column] || ''}
                  onChange={(e) => handleFilterChange(column, e.target.value ? [e.target.value] : [])}
                >
                  <option value="">All</option>
                  {columnOptions[column].map(option => (
                    <option key={option} value={option}>
                      {option || 'NULL'}
                    </option>
                  ))}
                </select>
              </div>
            ))
          }
        </div>
        <div className="flex justify-end gap-2">
          <button 
            className="p-2 border rounded bg-gray-300"
            onClick={resetFilters}
          >
            Reset
          </button>
          <button 
            className="p-2 border rounded bg-blue-500 text-white"
            onClick={applyFilters}
          >
            Apply Filters
          </button>
        </div>
      </div>
      
      {/* Data Table */}
      <div className="overflow-x-auto border rounded shadow">
        <table className="min-w-full bg-white">
          <thead className="bg-gray-100">
            <tr>
              {visibleColumns.map(column => (
                <th 
                  key={column}
                  className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => requestSort(column)}
                >
                  {column}
                  {sortConfig.key === column && (
                    <span className="ml-1">
                      {sortConfig.direction === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  {visibleColumns.map(column => (
                    <td key={column} className="py-2 px-4 text-sm">
                      {formatValue(row[column], column)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td 
                  colSpan={visibleColumns.length} 
                  className="py-4 px-4 text-center text-gray-500"
                >
                  No data found matching your criteria
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          Showing {paginatedData.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0} to {Math.min(currentPage * rowsPerPage, sortedData.length)} of {sortedData.length} results
        </div>
        <div className="flex space-x-1">
          <button
            className="px-3 py-1 border rounded bg-white disabled:opacity-50"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(1)}
          >
            &laquo;
          </button>
          <button
            className="px-3 py-1 border rounded bg-white disabled:opacity-50"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          >
            &lsaquo;
          </button>
          
          <span className="px-3 py-1 border rounded bg-gray-100">
            {currentPage} / {totalPages || 1}
          </span>
          
          <button
            className="px-3 py-1 border rounded bg-white disabled:opacity-50"
            disabled={currentPage === totalPages || totalPages === 0}
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
          >
            &rsaquo;
          </button>
          <button
            className="px-3 py-1 border rounded bg-white disabled:opacity-50"
            disabled={currentPage === totalPages || totalPages === 0}
            onClick={() => setCurrentPage(totalPages)}
          >
            &raquo;
          </button>
        </div>
      </div>
    </div>
  );
};

// Render the app
ReactDOM.render(<CircleCIDataDashboard />, document.getElementById('app'));
