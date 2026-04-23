import React from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info);
  }

  handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 bg-background">
        <Alert variant="destructive" className="max-w-xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>页面渲染出错</AlertTitle>
          <AlertDescription>
            <p className="mb-2 text-sm">{error.message || '未知错误'}</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => window.location.reload()}>刷新页面</Button>
              <Button size="sm" variant="secondary" onClick={this.handleReset}>重试</Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
}
