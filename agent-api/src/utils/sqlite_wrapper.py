"""SQLite connection wrapper for AsyncSqliteSaver compatibility."""


class AsyncSqliteConnectionWrapper:
    """Wrapper to add is_alive() method to aiosqlite connection.

    AsyncSqliteSaver expects a connection with is_alive() method,
    but aiosqlite.Connection doesn't have this method.
    This wrapper adds the missing method while delegating
    all other calls to the wrapped connection.
    """

    def __init__(self, conn):
        """Initialize wrapper with aiosqlite connection.

        Args:
            conn: aiosqlite.Connection instance
        """
        self._conn = conn

    def is_alive(self):
        """Check if connection is alive.

        Returns:
            bool: True if connection exists and is not None
        """
        return self._conn is not None

    def __getattr__(self, name):
        """Delegate all other attributes to the wrapped connection.

        Args:
            name: Attribute name

        Returns:
            The attribute from the wrapped connection
        """
        return getattr(self._conn, name)
