'use client';

import { useState, useEffect } from 'react';

type UnitAllocation = {
  id: string;
  unitType: string | null;
  brType: string | null;
  damacIslandcode: string | null;
  points: number | null;
  remainingStock: number | null;
  catalogueId: string | null;
  unitStatus?: string | null;
};

type AgentProfile = {
  code: string;
  displayName: string;
  balance: number;
};

export default function AdminAllocatePage() {
  const [agentCode, setAgentCode] = useState('');
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [units, setUnits] = useState<UnitAllocation[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<UnitAllocation | null>(null);
  const [lerReference, setLerReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch all units on mount
  useEffect(() => {
    fetchUnits();
  }, []);

  async function fetchUnits() {
    try {
      const res = await fetch('/api/admin/units');
      if (!res.ok) throw new Error('Failed to fetch units');
      const data = await res.json();
      setUnits(data.units || []);
    } catch (err) {
      console.error('Error fetching units:', err);
      setError(err instanceof Error ? err.message : 'Failed to load units');
    }
  }

  async function fetchAgent() {
    if (!agentCode.trim()) {
      setError('Please enter an agent code');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/loyalty?agentCode=${agentCode.trim()}`);
      if (!res.ok) throw new Error('Agent not found');
      const data = await res.json();

      setAgent({
        code: agentCode.trim(),
        displayName: data.displayName || agentCode.trim(),
        balance: data.totals?.totalPoints || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agent');
      setAgent(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectUnit(unit: UnitAllocation) {
    setSelectedUnit(unit);
    setLerReference('');
    setError(null);
    setSuccess(null);
  }

  async function handleAllocate() {
    if (!agent || !selectedUnit || !lerReference.trim()) {
      setError('Missing required fields');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/admin/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentCode: agent.code,
          unitAllocationId: selectedUnit.id,
          lerReference: lerReference.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Allocation failed');
      }

      setSuccess(
        `Successfully allocated ${data.allocation?.unit} to ${data.allocation?.agent} (LER: ${data.allocation?.ler})`
      );
      setSelectedUnit(null);
      setLerReference('');
      // Refresh units list
      await fetchUnits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Allocation failed');
    } finally {
      setLoading(false);
    }
  }

  const sortedUnits = [...units].sort((a, b) => {
    // Sort by status (available first, then reserved, then sold)
    const statusA = (a.unitStatus || 'available').toLowerCase();
    const statusB = (b.unitStatus || 'available').toLowerCase();
    if (statusA !== statusB) {
      if (statusA === 'available') return -1;
      if (statusB === 'available') return 1;
      if (statusA === 'reserved') return -1;
      if (statusB === 'reserved') return 1;
    }
    // Then by island code
    return (a.damacIslandcode || '').localeCompare(b.damacIslandcode || '');
  });

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        DAMAC Unit Allocation - Admin Panel
      </h1>

      {/* Agent Selection */}
      <div style={{ marginBottom: '2rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>1. Select Agent</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Agent Code
            </label>
            <input
              type="text"
              value={agentCode}
              onChange={(e) => setAgentCode(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && fetchAgent()}
              placeholder="Enter agent code (e.g., AG12345)"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
              }}
            />
          </div>
          <button
            onClick={fetchAgent}
            disabled={loading || !agentCode.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: loading ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
            }}
          >
            {loading ? 'Loading...' : 'Fetch Agent'}
          </button>
        </div>

        {agent && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '4px' }}>
            <p style={{ margin: 0 }}>
              <strong>Agent:</strong> {agent.displayName} ({agent.code})
            </p>
            <p style={{ margin: 0, marginTop: '0.5rem' }}>
              <strong>Available Points:</strong> {agent.balance.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Units Table */}
      {agent && (
        <div style={{ marginBottom: '2rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
            2. Select Unit ({sortedUnits.length} total)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    Island Code
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    Unit Type
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    BR Type
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                    Status
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #ddd' }}>
                    Points
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #ddd' }}>
                    Stock
                  </th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #ddd' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedUnits.map((unit) => {
                  const unitPoints = unit.points ?? 0;
                  const hasEnough = agent.balance >= unitPoints;
                  const status = (unit.unitStatus || 'Available').toLowerCase();
                  const isSold = status === 'sold' || status === 'unavailable';

                  // Status badge color
                  let statusColor = '#4caf50'; // green for available
                  if (isSold) statusColor = '#ff4444'; // red for sold
                  else if (status === 'reserved') statusColor = '#ff9800'; // orange for reserved

                  return (
                    <tr
                      key={unit.id}
                      style={{
                        borderBottom: '1px solid #eee',
                        opacity: isSold ? 0.6 : 1,
                        backgroundColor: selectedUnit?.id === unit.id ? '#f0f9ff' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.75rem' }}>{unit.damacIslandcode || 'N/A'}</td>
                      <td style={{ padding: '0.75rem' }}>{unit.unitType || 'N/A'}</td>
                      <td style={{ padding: '0.75rem' }}>{unit.brType || 'N/A'}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: statusColor,
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            fontWeight: '500',
                          }}
                        >
                          {unit.unitStatus || 'Available'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {unitPoints.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{unit.remainingStock ?? 0}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <button
                          onClick={() => handleSelectUnit(unit)}
                          disabled={!hasEnough || isSold}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: hasEnough && !isSold ? '#0070f3' : '#ccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: hasEnough && !isSold ? 'pointer' : 'not-allowed',
                            fontSize: '0.9rem',
                          }}
                        >
                          {isSold ? 'Sold' : !hasEnough ? 'Insufficient Points' : 'Select'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LER Input and Allocation */}
      {selectedUnit && (
        <div style={{ marginBottom: '2rem', padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>3. Enter LER and Allocate</h2>

          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fffbeb', borderRadius: '4px' }}>
            <p style={{ margin: 0 }}>
              <strong>Selected Unit:</strong> {selectedUnit.damacIslandcode} - {selectedUnit.unitType} ({selectedUnit.brType})
            </p>
            <p style={{ margin: 0, marginTop: '0.5rem' }}>
              <strong>Required Points:</strong> {(selectedUnit.points ?? 0).toLocaleString()}
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              LER Reference
            </label>
            <input
              type="text"
              value={lerReference}
              onChange={(e) => setLerReference(e.target.value)}
              placeholder="Enter LER code (e.g., LER-1234 or 1234)"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
              }}
            />
          </div>

          <button
            onClick={handleAllocate}
            disabled={loading || !lerReference.trim()}
            style={{
              padding: '0.75rem 2rem',
              backgroundColor: loading || !lerReference.trim() ? '#ccc' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || !lerReference.trim() ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            {loading ? 'Allocating...' : 'Allocate Unit'}
          </button>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          <strong style={{ color: '#dc2626' }}>Error:</strong> {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#d1fae5',
            border: '1px solid #6ee7b7',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          <strong style={{ color: '#059669' }}>Success:</strong> {success}
        </div>
      )}
    </div>
  );
}
