import React from 'react';
import { useParams } from 'react-router-dom';
import { useParkDetails } from '../hooks/useParks';

const TestParkPage = () => {
  const { parkCode } = useParams();
  const { data, isLoading, error } = useParkDetails(parkCode);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Park Details</h1>
      <p>Park Code: {parkCode}</p>
      <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
      <p>Error: {error ? error.message : 'None'}</p>
      <pre className="bg-gray-100 p-4 mt-4 overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

export default TestParkPage;
