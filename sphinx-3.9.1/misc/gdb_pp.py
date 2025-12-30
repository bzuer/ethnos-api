import gdb.printing

# to use this file add such a line to your .gdbinit
# source /path/to/sphinx-dev/misc/gdb_pp.py

class StringPrinter(object):
    "Print a String"

    def __init__(self, val):
        self.val = val

    def to_string(self):
        return self.val['m_szValue']

    def display_hint(self):
        return 'string'

class VecPrinter(object):
    "Print a Vec"

    class _VectorIterator(object):
        "Iterator over Vec elements"

        def __init__(self, ptr, length):
            self.item = ptr
            self.length = length
            self.count = 0

        def __iter__(self):
            return self

        def __next__(self):
            if self.count == self.length:
                raise StopIteration
            entry = self.item.dereference()
            self.item += 1
            self.count += 1
            return ("[%d]" % (self.count - 1), entry)

    def __init__(self, val):
        self.val = val
        self.length = self.val["m_iLength"]
        self.limit = self.val["m_iLimit"]
        self.iterator = self._VectorIterator(self.val["m_pData"], self.length)

    def to_string(self):
        return "Vec of length %d, limit %d" % (self.length, self.limit)

    def children(self):
        return self.iterator

    def display_hint(self):
        return "array"

def build_pretty_printer():
    pp = gdb.printing.RegexpCollectionPrettyPrinter('sphinx_printers')
    pp.add_printer('String', '^String$', StringPrinter)
    pp.add_printer('Vec', '^Vec<.*>$', VecPrinter)
    return pp

gdb.printing.register_pretty_printer(
    gdb.current_objfile(),
    build_pretty_printer())
