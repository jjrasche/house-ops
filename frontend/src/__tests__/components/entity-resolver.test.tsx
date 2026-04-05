import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityResolver } from '../../components/entity-resolver';

afterEach(cleanup);

describe('EntityResolver', () => {
  it('renders all unresolved mentions', () => {
    render(
      <EntityResolver mentions={['chex mix', 'oat milk']} onResolve={vi.fn()} />,
    );
    expect(screen.getAllByText(/chex mix/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/oat milk/).length).toBeGreaterThanOrEqual(1);
  });

  it('expands form when mention row is tapped', async () => {
    render(
      <EntityResolver mentions={['chex mix']} onResolve={vi.fn()} />,
    );
    const toggle = screen.getByRole('button', { name: /chex mix/ });
    await userEvent.click(toggle);

    expect(screen.getByRole('form', { name: /Add chex mix/ })).toBeDefined();
    expect(screen.getByDisplayValue('chex mix')).toBeDefined();
  });

  it('collapses form when tapped again', async () => {
    render(
      <EntityResolver mentions={['chex mix']} onResolve={vi.fn()} />,
    );
    const toggle = screen.getByRole('button', { name: /chex mix/ });
    await userEvent.click(toggle);
    expect(screen.getByRole('form', { name: /Add chex mix/ })).toBeDefined();

    await userEvent.click(toggle);
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('pre-fills entity name with mention text', async () => {
    render(
      <EntityResolver mentions={['oat milk']} onResolve={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /oat milk/ }));
    expect(screen.getByDisplayValue('oat milk')).toBeDefined();
  });

  it('defaults entity type to item', async () => {
    render(
      <EntityResolver mentions={['chex mix']} onResolve={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /chex mix/ }));
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('item');
  });

  it('calls onResolve with mention, type, and name when submitted', async () => {
    const onResolve = vi.fn();
    render(
      <EntityResolver mentions={['chex mix']} onResolve={onResolve} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /chex mix/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to database' }));

    expect(onResolve).toHaveBeenCalledWith('chex mix', 'item', 'chex mix');
  });

  it('calls onResolve with changed type when user selects different type', async () => {
    const onResolve = vi.fn();
    render(
      <EntityResolver mentions={['Charlie']} onResolve={onResolve} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Charlie/ }));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'person');
    await userEvent.click(screen.getByRole('button', { name: 'Add to database' }));

    expect(onResolve).toHaveBeenCalledWith('Charlie', 'person', 'Charlie');
  });

  it('calls onResolve with edited name when user changes the input', async () => {
    const onResolve = vi.fn();
    render(
      <EntityResolver mentions={['oatmilk']} onResolve={onResolve} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /oatmilk/ }));
    const nameInput = screen.getByDisplayValue('oatmilk');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Oat Milk');
    await userEvent.click(screen.getByRole('button', { name: 'Add to database' }));

    expect(onResolve).toHaveBeenCalledWith('oatmilk', 'item', 'Oat Milk');
  });

  it('disables form controls when isResolving is true', async () => {
    render(
      <EntityResolver mentions={['chex mix']} onResolve={vi.fn()} isResolving />,
    );
    await userEvent.click(screen.getByRole('button', { name: /chex mix/ }));

    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDefined();
    expect((screen.getByRole('button', { name: 'Adding...' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables submit when name is empty', async () => {
    render(
      <EntityResolver mentions={['chex mix']} onResolve={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /chex mix/ }));
    const nameInput = screen.getByDisplayValue('chex mix');
    await userEvent.clear(nameInput);

    const submitButton = screen.getByRole('button', { name: 'Add to database' }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  it('only expands one mention at a time', async () => {
    render(
      <EntityResolver mentions={['chex mix', 'oat milk']} onResolve={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /chex mix/ }));
    expect(screen.getByRole('form', { name: /Add chex mix/ })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: /oat milk/ }));
    expect(screen.queryByRole('form', { name: /Add chex mix/ })).toBeNull();
    expect(screen.getByRole('form', { name: /Add oat milk/ })).toBeDefined();
  });
});
