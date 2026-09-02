import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SajCRM from './page';

jest.mock('lucide-react');

// Mock the global fetch
global.fetch = jest.fn();

const mockCustomers = [
  {
    id: '1',
    name: 'علی احمدی',
    phone: '09123456789',
    email: null,
    type: 'BUYER',
    stage: 'NEW',
    temp: 'WARM',
    area: 'سعادت آباد',
    budget: '10000',
    source: 'DIRECT_CALL',
    nextFollowUp: 'امروز',
  },
  {
    id: '2',
    name: 'سارا کریمی',
    phone: '09129876543',
    email: null,
    type: 'SELLER',
    stage: 'VIEWING',
    temp: 'HOT',
    area: 'پونک',
    budget: null,
    source: 'INSTAGRAM',
    nextFollowUp: 'فردا',
  },
  {
    id: '3',
    name: 'محمد رضایی',
    phone: '09121112233',
    email: null,
    type: 'TENANT',
    stage: 'CONTRACT',
    temp: 'COLD',
    area: 'شهرک غرب',
    budget: '500',
    source: 'REFERRAL',
    nextFollowUp: 'عقب‌افتاده',
  },
];

describe('SajCRM Dashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    // Keep fetch pending to show loading state
    (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

    render(<SajCRM />);
    expect(screen.getByText('در حال بارگذاری...')).toBeInTheDocument();
  });

  it('renders dashboard with data after fetching', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCustomers,
    });

    render(<SajCRM />);

    await waitFor(() => {
      expect(screen.queryByText('در حال بارگذاری...')).not.toBeInTheDocument();
    });

    // Check greeting
    expect(screen.getByText(/سلام بهزاد 👋/i)).toBeInTheDocument();

    // Check KPI numbers based on mock data
    // 1 overdue (محمد رضایی), 1 today follow-up (علی احمدی), 1 viewing (سارا کریمی)
    const overdueElements = screen.getAllByText('1');
    expect(overdueElements.length).toBeGreaterThan(0);
  });

  it('handles navigation between tabs', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCustomers,
    });

    render(<SajCRM />);

    await waitFor(() => {
      expect(screen.queryByText('در حال بارگذاری...')).not.toBeInTheDocument();
    });

    // Click "Customers" tab
    fireEvent.click(screen.getByText('مشتریان'));

    // Check if customer tab specific elements are rendered
    expect(screen.getByText('افزودن مشتری')).toBeInTheDocument();
    expect(screen.getByText('تازه‌وارد')).toBeInTheDocument(); // Stage label
    expect(screen.getByText('علی احمدی')).toBeInTheDocument(); // Customer in NEW stage

    // Navigate to "Properties" tab which is under construction
    fireEvent.click(screen.getByText('املاک'));
    expect(screen.getByText(/این بخش.*در فاز بعدی طراحی می‌شه/i)).toBeInTheDocument();
  });

  it('opens and closes add customer modal', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<SajCRM />);

    await waitFor(() => {
      expect(screen.queryByText('در حال بارگذاری...')).not.toBeInTheDocument();
    });

    // Click Add Customer button
    fireEvent.click(screen.getByText('افزودن مشتری جدید'));

    // Check if modal is open
    expect(screen.getAllByText('افزودن مشتری جدید')[0]).toBeInTheDocument();

    // Click Cancel button
    fireEvent.click(screen.getByText('انصراف'));

    // Ensure modal is closed (querying for something only in modal)
    expect(screen.queryByText('انصراف')).not.toBeInTheDocument();
  });

  it('submits new customer form successfully', async () => {
    const user = userEvent.setup();

    // Initial fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<SajCRM />);

    await waitFor(() => {
      expect(screen.queryByText('در حال بارگذاری...')).not.toBeInTheDocument();
    });

    // Open modal
    fireEvent.click(screen.getByText('افزودن مشتری جدید'));

    // Fill form
    const nameInput = document.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    const phoneInput = document.querySelector('input[type="tel"]') as HTMLInputElement;

    await user.type(nameInput, 'مشتری جدید');
    await user.type(phoneInput, '09121234567');

    // Mock the post request and subsequent fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: '4', name: 'مشتری جدید' }],
    });

    // Submit form
    fireEvent.click(screen.getByText('ثبت مشتری'));

    // Wait for submission and modal close
    await waitFor(() => {
      expect(screen.queryByText('ثبت مشتری')).not.toBeInTheDocument();
    });

    // Verify fetch was called with right args
    expect(global.fetch).toHaveBeenCalledWith('/api/customers', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('shows error alert on failed customer submission', async () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    // Initial fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<SajCRM />);

    await waitFor(() => {
      expect(screen.queryByText('در حال بارگذاری...')).not.toBeInTheDocument();
    });

    // Open modal
    fireEvent.click(screen.getByText('افزودن مشتری جدید'));

    // Fill form
    const nameInput = document.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    const phoneInput = document.querySelector('input[type="tel"]') as HTMLInputElement;

    await user.type(nameInput, 'مشتری جدید');
    await user.type(phoneInput, '09121234567');

    // Mock failed request
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Error message' }),
    });

    // Submit form
    fireEvent.click(screen.getByText('ثبت مشتری'));

    // Wait for error alert
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('Error message');
    });

    alertMock.mockRestore();
  });
});
